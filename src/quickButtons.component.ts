import { Component, ElementRef, HostListener, Inject, NgZone, OnDestroy, ViewChild } from '@angular/core'
import { Subscription } from 'rxjs'
import { AppService, ConfigService, NotificationsService, SplitTabComponent } from 'tabby-core'
import { BaseTerminalProfile, BaseTerminalTabComponent } from 'tabby-terminal'
import { FloatingButton } from './floatingButton'
import { styles } from './quickButtons.styles'
import { template } from './quickButtons.view'
import { ShortcutTree, isValidCommandText, visibleScopes } from './shortcutTree'
import type { Command, CommandPosition, Entry, GroupLocation, QuickButtonsConfig, Scope, SearchResult, VisibleScope } from './shortcutTree'

type Terminal = BaseTerminalTabComponent<BaseTerminalProfile>

interface Editor {
    scope: VisibleScope
    parentPath: number[]
    index?: number
    entry: Entry
    deleting: boolean
    location: string
    move?: { destinations: GroupLocation[], selected: number }
}

interface DraggedCommand extends CommandPosition {
    entries: Entry[]
}

interface DropPosition {
    entries: Entry[]
    rowIndex?: number
    after: boolean
    insertAt: number
}

interface ButtonAppearance {
    color: string | null
    opacity: number
}

const commandDragType = 'application/x-tabby-quick-button'
const defaultAppearance: ButtonAppearance = { color: null, opacity: 100 }
const hexColor = /^#[0-9a-f]{6}$/i

@Component({
    selector: 'tabby-quick-buttons',
    template,
    styles: [styles],
})
export class QuickButtonsComponent implements OnDestroy {
    target: Terminal | null = null
    scopes: VisibleScope[] = []
    managing = false
    editor: Editor | null = null
    appearanceDraft: ButtonAppearance | null = null
    busy = false
    error = ''
    dragged: DraggedCommand | null = null
    dropTarget: DropPosition | null = null
    pinned = false
    searchQuery = ''
    private readonly floatingButton = new FloatingButton(
        () => {
            if (!this.pinned && !this.managing) {
                this.close()
            }
        },
        () => this.notifications.info('Quick Buttons moved. This window could not save its position.'),
    )
    private panelContext?: Subscription
    private editorOpener?: HTMLElement
    @ViewChild('dock') private dock?: ElementRef<HTMLElement>
    @ViewChild('doneButton') private doneButton?: ElementRef<HTMLButtonElement>

    @ViewChild('editorFocus') set editorFocus (field: ElementRef<HTMLElement> | undefined) {
        if (field) {
            queueMicrotask(() => field.nativeElement.focus())
        }
    }
    private readonly tree = new ShortcutTree()
    readonly trackEntry = this.tree.trackEntry

    constructor (
        @Inject(AppService) private readonly app: AppService,
        @Inject(ConfigService) private readonly config: ConfigService,
        @Inject(NotificationsService) private readonly notifications: NotificationsService,
        @Inject(NgZone) private readonly zone: NgZone,
    ) {}

    get activeTerminal (): Terminal | null {
        const tab = this.app.activeTab
        const pane = tab instanceof SplitTabComponent ? tab.getFocusedTab() : tab
        return pane instanceof BaseTerminalTabComponent ? pane : null
    }

    get expanded (): boolean {
        return this.target !== null && this.target === this.activeTerminal
    }

    private get settings (): QuickButtonsConfig {
        return this.config.store.quickButtons
    }

    get buttonAppearance (): ButtonAppearance {
        const { floatingButtonColor: color, floatingButtonOpacity: opacity } = this.settings
        return {
            color: typeof color === 'string' && hexColor.test(color) ? color : defaultAppearance.color,
            opacity: typeof opacity === 'number' && Number.isFinite(opacity)
                ? Math.max(0, Math.min(100, opacity)) : defaultAppearance.opacity,
        }
    }

    get editing (): boolean {
        return this.editor !== null || this.appearanceDraft !== null
    }

    buttonInk (color: string | null): string | null {
        if (!color) {
            return null
        }
        const red = parseInt(color.slice(1, 3), 16)
        const green = parseInt(color.slice(3, 5), 16)
        const blue = parseInt(color.slice(5, 7), 16)
        return red * 0.299 + green * 0.587 + blue * 0.114 > 150 ? '#161a20' : '#fff'
    }

    get searchResults (): SearchResult[] {
        return this.tree.search(this.scopes, this.searchQuery)
    }

    trackMatch (_index: number, match: SearchResult): Command {
        return match.entry
    }

    get layout () {
        return this.floatingButton.layout
    }

    get movingBall (): boolean {
        return this.floatingButton.movingBall
    }

    @HostListener('window:resize')
    @HostListener('document:fullscreenchange')
    updateViewport (): void {
        this.floatingButton.updateViewport()
    }

    startBallDrag (event: PointerEvent): void {
        this.floatingButton.startDrag(event)
    }

    togglePinned (): void {
        if (!this.activeTerminal) {
            this.notifications.info('Open a terminal to use Quick Buttons.')
            return
        }
        if (this.busy || this.editing) {
            return
        }
        if (this.pinned || this.managing) {
            this.close()
            return
        }
        this.open()
        this.pinned = true
    }

    open (): void {
        const terminal = this.activeTerminal
        if (!terminal || this.expanded || this.busy || this.floatingButton.dragging) {
            return
        }
        this.target = terminal
        this.managing = false
        this.editor = null
        this.error = ''
        this.refreshScopes()

        const tab = this.app.activeTab
        this.panelContext?.unsubscribe()
        this.panelContext = this.app.activeTabChange$.subscribe(() => this.close())
        this.watchPanelHover(this.panelContext)
        if (tab instanceof SplitTabComponent) {
            this.panelContext.add(tab.focusChanged$.subscribe(pane => {
                if (pane !== terminal) {
                    this.close()
                }
            }))
        }
    }

    private watchPanelHover (context: Subscription): void {
        const onMove = (event: MouseEvent): void => {
            if (this.pinned || this.managing || this.floatingButton.dragging) {
                return
            }
            const hit = document.elementFromPoint(event.clientX, event.clientY)
            if (this.dock && !this.dock.nativeElement.contains(hit)) {
                this.zone.run(() => this.leave())
            }
        }
        const onBlur = (): void => this.zone.run(() => this.leave())
        this.zone.runOutsideAngular(() => {
            document.addEventListener('mousemove', onMove, true)
            window.addEventListener('blur', onBlur)
        })
        context.add(() => {
            document.removeEventListener('mousemove', onMove, true)
            window.removeEventListener('blur', onBlur)
        })
    }

    close (): void {
        this.panelContext?.unsubscribe()
        this.target = null
        this.managing = false
        this.pinned = false
        this.searchQuery = ''
        this.editor = null
        this.appearanceDraft = null
        this.editorOpener = undefined
        this.error = ''
        this.endCommandDrag()
        this.floatingButton.cancelDrag()
    }

    ngOnDestroy (): void {
        this.close()
    }

    leave (): void {
        if (!this.managing && !this.pinned && !this.floatingButton.dragging) {
            this.close()
        }
    }

    finishManagement (): void {
        if (!this.pinned) {
            this.close()
            return
        }
        this.managing = false
        this.cancelEdit()
    }

    escape (): void {
        if (this.busy) {
            return
        }
        if (this.editing) {
            this.cancelEdit()
        } else if (this.searchQuery) {
            this.searchQuery = ''
        } else {
            this.close()
        }
    }

    execute (command: Command, scope: VisibleScope): void {
        const terminal = this.target
        const session = terminal?.session
        if (!terminal || terminal !== this.activeTerminal || !session?.open ||
            (scope.profileId !== null && terminal.profile?.id !== scope.profileId)) {
            this.error = 'Switch to the matching connected terminal and try again.'
            return
        }
        if (!isValidCommandText(command.text)) {
            this.error = 'Enter a single line of terminal text for this command.'
            return
        }
        terminal.sendInput(`${command.text}${command.sendEnter !== false ? '\r' : ''}`)
        if (!this.pinned) {
            this.close()
        }
        terminal.emitFocused()
    }

    add (scope: VisibleScope, parentPath: number[], kind: Entry['kind'], event?: MouseEvent): void {
        const entry: Entry = kind === 'group'
            ? { kind, title: '', entries: [] }
            : { kind, title: '', text: '', sendEnter: true }
        this.setEditor({ scope, parentPath, entry, deleting: false }, event)
    }

    edit (scope: VisibleScope, parentPath: number[], index: number, entry: Entry, deleting = false, event?: MouseEvent): void {
        this.setEditor({ scope, parentPath, index, entry: { ...entry }, deleting }, event)
    }

    startMove (scope: VisibleScope, parentPath: number[], index: number, entry: Command, event: MouseEvent): void {
        const currentEntries = this.tree.entriesAt(scope.entries, parentPath)
        const destinations = this.tree.groups(this.scopes).filter(group => group.entries !== currentEntries)
        this.setEditor({ scope, parentPath, index, entry, deleting: false, move: { destinations, selected: -1 } }, event)
    }

    hasMoveDestination (scope: VisibleScope, path: number[]): boolean {
        return path.length > 0 || this.scopes.length > 1 || scope.entries.some(entry => entry.kind === 'group')
    }

    private setEditor (editor: Omit<Editor, 'location'>, event?: MouseEvent): void {
        this.error = ''
        this.editorOpener = event?.currentTarget as HTMLElement | undefined
        this.editor = { ...editor, location: this.tree.location(editor.scope, editor.parentPath) }
    }

    cancelEdit (): void {
        const opener = this.editorOpener
        this.editor = null
        this.appearanceDraft = null
        this.editorOpener = undefined
        this.error = ''
        if (opener) {
            requestAnimationFrame(() => {
                if (this.managing && !this.editing) {
                    const target = opener.isConnected ? opener : this.doneButton?.nativeElement
                    target?.focus({ preventScroll: true })
                }
            })
        }
    }

    editAppearance (event: MouseEvent): void {
        this.editorOpener = event.currentTarget as HTMLElement
        this.appearanceDraft = this.buttonAppearance
        this.error = ''
    }

    resetAppearance (): void {
        this.appearanceDraft = { ...defaultAppearance }
    }

    async saveAppearance (): Promise<void> {
        const draft = this.appearanceDraft
        if (!draft || this.busy) {
            return
        }
        if ((draft.color !== null && !hexColor.test(draft.color)) ||
            !Number.isFinite(draft.opacity) || draft.opacity < 0 || draft.opacity > 100) {
            this.error = 'Choose a color and an opacity between 0 and 100%.'
            return
        }

        const settings = this.settings
        const previousColor = settings.floatingButtonColor
        const previousOpacity = settings.floatingButtonOpacity
        settings.floatingButtonColor = draft.color
        settings.floatingButtonOpacity = draft.opacity
        await this.saveConfig(() => {
            if (this.settings === settings &&
                settings.floatingButtonColor === draft.color && settings.floatingButtonOpacity === draft.opacity) {
                settings.floatingButtonColor = previousColor
                settings.floatingButtonOpacity = previousOpacity
            }
        })
    }

    startCommandDrag (event: DragEvent, scope: VisibleScope, parentPath: number[], entries: Entry[], index: number): void {
        if (!this.managing || this.editing || this.busy || !event.dataTransfer) {
            event.preventDefault()
            return
        }
        this.error = ''
        this.dragged = { scope, parentPath, entries, index }
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData(commandDragType, 'command')
    }

    dragOver (event: DragEvent, entries: Entry[], rowIndex?: number): void {
        const position = this.dropPosition(event, entries, rowIndex)
        this.dropTarget = position ?? null
        if (!position || !event.dataTransfer) {
            return
        }
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
    }

    dragLeave (event: DragEvent, entries: Entry[], rowIndex?: number): void {
        const target = event.currentTarget as HTMLElement
        if (this.dropTarget?.entries === entries && this.dropTarget.rowIndex === rowIndex &&
            !target.contains(event.relatedTarget as Node | null)) {
            this.dropTarget = null
        }
    }

    private dropPosition (event: DragEvent, entries: Entry[], rowIndex?: number): DropPosition | undefined {
        const drag = this.dragged
        if (!drag) {
            return
        }
        let after = false
        if (rowIndex !== undefined) {
            const row = (event.currentTarget as HTMLElement).getBoundingClientRect()
            after = event.clientY >= row.top + row.height / 2
        }
        const insertAt = rowIndex === undefined ? entries.length : rowIndex + Number(after)
        if (drag.entries === entries && (rowIndex === undefined || insertAt === drag.index || insertAt === drag.index + 1)) {
            return
        }
        return { entries, rowIndex, after, insertAt }
    }

    endCommandDrag (): void {
        this.dragged = null
        this.dropTarget = null
    }

    async dropCommand (event: DragEvent, scope: VisibleScope, path: number[], entries: Entry[], rowIndex?: number): Promise<void> {
        const drag = this.dragged
        const position = this.dropPosition(event, entries, rowIndex)
        if (!drag || !position || event.dataTransfer?.getData(commandDragType) !== 'command') {
            return
        }
        event.preventDefault()
        this.endCommandDrag()
        if (!this.managing || !this.expanded || this.editing || this.busy) {
            return
        }
        await this.moveCommand(drag, scope, path, position.insertAt)
    }

    private async moveCommand (origin: CommandPosition, scope: VisibleScope, path: number[], requestedIndex?: number): Promise<void> {
        const changes = this.tree.move(origin, scope, path, requestedIndex)
        if (!changes) {
            this.error = 'The command or group is missing. Start the move again.'
            return
        }
        await this.persist(changes)
    }

    async save (): Promise<void> {
        const editor = this.editor
        if (!editor || this.busy) {
            return
        }

        const { scope, parentPath, index, entry, deleting } = editor
        if (editor.move && index !== undefined) {
            const target = editor.move.destinations[editor.move.selected]
            if (target) {
                await this.moveCommand({ scope, parentPath, index }, target.scope, target.parentPath)
            }
            return
        }
        if (!deleting && (!entry.title.trim() || (entry.kind === 'command' &&
            !isValidCommandText(entry.text)))) {
            this.error = entry.kind === 'group' ? 'Enter a group name.' : 'Enter an alias and a single line of terminal text.'
            return
        }

        const updated = this.tree.edit(scope, parentPath, index, entry, deleting)
        if (!updated) {
            this.error = 'The original group is missing. Start the edit again.'
            return
        }
        await this.persist(new Map([[scope, updated]]))
    }

    private async persist (changes: Map<VisibleScope, Scope>): Promise<void> {
        const settings = this.settings
        const previous = settings.scopes
        for (const scope of changes.keys()) {
            if (previous.find(item => item.profileId === scope.profileId) !== scope.saved) {
                this.refreshScopes()
                this.cancelEdit()
                this.error = 'Shortcuts changed elsewhere. Try again.'
                return
            }
        }
        const updated = [...changes.values()]
        const next = [
            ...previous.filter(item => !updated.some(scope => scope.profileId === item.profileId)),
            ...updated.filter(scope => scope.entries.length),
        ]

        settings.scopes = next
        await this.saveConfig(() => {
            if (this.settings === settings && (settings.scopes === next || (!next.length && !settings.scopes.length))) {
                settings.scopes = previous
            }
        }, () => this.refreshScopes())
    }

    private async saveConfig (rollback: () => void, onSaved?: () => void): Promise<void> {
        this.busy = true
        this.error = ''
        try {
            await this.config.save()
        } catch {
            this.zone.run(() => {
                this.busy = false
                rollback()
                this.error = 'Could not save the Tabby configuration. Try again.'
            })
            return
        }
        this.zone.run(() => {
            this.busy = false
            this.cancelEdit()
            onSaved?.()
        })
    }

    private refreshScopes (): void {
        this.scopes = visibleScopes(this.settings.scopes, this.target?.profile)
    }

    trackScope (_index: number, scope: VisibleScope): string | null {
        return scope.profileId
    }
}
