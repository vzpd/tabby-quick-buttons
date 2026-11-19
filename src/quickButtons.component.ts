import { Component, ElementRef, HostListener, Inject, NgZone, OnDestroy, ViewChild } from '@angular/core'
import { Subscription } from 'rxjs'
import { AppService, ConfigService, NotificationsService, SplitTabComponent } from 'tabby-core'
import { BaseTerminalProfile, BaseTerminalTabComponent } from 'tabby-terminal'
import { styles, template } from './quickButtons.view'

interface Command {
    kind: 'command'
    title: string
    text: string
    sendEnter: boolean
}

interface Group {
    kind: 'group'
    title: string
    entries: Entry[]
}

type Entry = Command | Group
type Terminal = BaseTerminalTabComponent<BaseTerminalProfile>

interface Scope {
    profileId: string | null
    entries: Entry[]
}

export interface QuickButtonsConfig {
    scopes: Scope[]
}

interface VisibleScope {
    profileId: string | null
    title: string
    saved: Scope | undefined
    entries: Entry[]
}

interface Editor {
    scope: VisibleScope
    parentPath: number[]
    index?: number
    entry: Entry
    deleting: boolean
    location: string
    move?: { destinations: GroupLocation[], selected: number }
}

interface GroupLocation {
    scope: VisibleScope
    parentPath: number[]
    entries: Entry[]
    location: string
}

interface CommandPosition {
    scope: VisibleScope
    parentPath: number[]
    index: number
}

interface SearchResult extends CommandPosition {
    entry: Command
    location: string
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

interface Position {
    x: number
    y: number
}

interface BallDrag {
    pointerId: number
    handle: HTMLElement
    pointer: Position
    origin: Position
    removeListeners: () => void
}

const invalidCommandCharacters = /[\x00-\x1f\x7f-\x9f]/
const ballSize = 52
const edge = 8
const positionKey = 'tabby-quick-buttons.floating-position'
const commandDragType = 'application/x-tabby-quick-button'

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
    busy = false
    error = ''
    dragged: DraggedCommand | null = null
    dropTarget: DropPosition | null = null
    movingBall = false
    pinned = false
    searchQuery = ''
    private ballPosition = this.loadBallPosition()
    private ballDrag: BallDrag | null = null
    private viewport = { width: window.innerWidth, height: window.innerHeight }
    private panelContext?: Subscription
    private editorOpener?: HTMLElement
    @ViewChild('dock') private dock?: ElementRef<HTMLElement>
    @ViewChild('doneButton') private doneButton?: ElementRef<HTMLButtonElement>

    @ViewChild('editorFocus') set editorFocus (field: ElementRef<HTMLElement> | undefined) {
        if (field) {
            queueMicrotask(() => field.nativeElement.focus())
        }
    }
    private readonly groupKeys = new WeakMap<Group, symbol>()
    readonly trackEntry = (_index: number, entry: Entry): Command | symbol =>
        entry.kind === 'group' ? this.groupKey(entry) : entry

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

    get searchResults (): SearchResult[] {
        const query = this.searchQuery.trim().toLocaleLowerCase()
        if (!query) {
            return []
        }
        return this.groupLocations().flatMap(({ scope, parentPath, entries, location }) =>
            entries.flatMap((entry, index) => entry.kind === 'command' && entry.title.toLocaleLowerCase().includes(query)
                ? [{ scope, parentPath, index, entry, location }]
                : []),
        )
    }

    trackMatch (_index: number, match: SearchResult): Command {
        return match.entry
    }

    private groupLocations (): GroupLocation[] {
        const groups: GroupLocation[] = []
        const visit = (scope: VisibleScope, parentPath: number[], entries: Entry[], location: string): void => {
            groups.push({ scope, parentPath, entries, location })
            entries.forEach((entry, index) => {
                if (entry.kind === 'group') {
                    visit(scope, parentPath.concat(index), entry.entries, `${location} / ${entry.title}`)
                }
            })
        }
        this.scopes.forEach(scope => visit(scope, [], scope.entries, scope.title))
        return groups
    }

    get layout () {
        const { width, height } = this.viewport
        const x = this.clamp(this.ballPosition?.x ?? width - ballSize - 24, width - ballSize - edge)
        const y = this.clampBallY(this.ballPosition?.y ?? height - ballSize - 16)
        const below = y + ballSize / 2 < height / 2
        const anchorRight = x + ballSize / 2 >= width / 2
        const panelWidth = Math.min(380, anchorRight ? x + ballSize - edge : width - x - edge)
        const panelHeight = (below ? height - y : y + ballSize) - edge
        return { x, y, panelWidth, panelHeight, panelOffset: anchorRight ? ballSize - panelWidth : 0, below, anchorRight }
    }

    @HostListener('window:resize')
    @HostListener('document:fullscreenchange')
    updateViewport (): void {
        this.viewport = { width: window.innerWidth, height: window.innerHeight }
    }

    private clamp (value: number, limit: number): number {
        return Math.max(edge, Math.min(value, limit))
    }

    private clampBallY (value: number): number {
        const terminalArea = document.querySelector('app-root .content.main > .content')
        const top = terminalArea?.getBoundingClientRect().top ?? edge
        const bottom = Math.max(edge, this.viewport.height - ballSize - edge)
        return Math.min(bottom, Math.max(edge, top, value))
    }

    private loadBallPosition (): Position | null {
        try {
            const position = JSON.parse(window.localStorage.getItem(positionKey) ?? 'null')
            return Number.isFinite(position?.x) && Number.isFinite(position?.y) ? position : null
        } catch {
            return null
        }
    }

    startBallDrag (event: PointerEvent): void {
        if (event.button !== 0 || !event.isPrimary) {
            return
        }
        event.preventDefault()
        this.finishBallDrag()
        this.updateViewport()
        const { x, y } = this.layout
        const handle = event.currentTarget as HTMLElement
        const onMove = (move: PointerEvent): void => this.moveBall(move)
        const onEnd = (end: PointerEvent): void => this.finishBallDrag(end)
        const onBlur = (): void => this.finishBallDrag()
        this.ballDrag = {
            pointerId: event.pointerId,
            handle,
            pointer: { x: event.clientX, y: event.clientY },
            origin: { x, y },
            removeListeners: () => {
                window.removeEventListener('pointermove', onMove, true)
                window.removeEventListener('pointerup', onEnd, true)
                window.removeEventListener('pointercancel', onEnd, true)
                window.removeEventListener('blur', onBlur)
            },
        }
        window.addEventListener('pointermove', onMove, true)
        window.addEventListener('pointerup', onEnd, true)
        window.addEventListener('pointercancel', onEnd, true)
        window.addEventListener('blur', onBlur)
        try {
            handle.setPointerCapture(event.pointerId)
        } catch (error) {
            if (!(error instanceof DOMException) || error.name !== 'NotFoundError') {
                throw error
            }
        }
    }

    private moveBall (event: PointerEvent): void {
        const drag = this.ballDrag
        if (!drag || drag.pointerId !== event.pointerId) {
            return
        }
        if ((event.buttons & 1) === 0) {
            this.finishBallDrag(event)
            return
        }
        this.updateBallPosition(event, drag)
    }

    private updateBallPosition (event: PointerEvent, drag: BallDrag): void {
        const dx = event.clientX - drag.pointer.x
        const dy = event.clientY - drag.pointer.y
        if (!this.movingBall && Math.hypot(dx, dy) < 5) {
            return
        }
        this.movingBall = true
        this.ballPosition = {
            x: this.clamp(drag.origin.x + dx, this.viewport.width - ballSize - edge),
            y: this.clampBallY(drag.origin.y + dy),
        }
    }

    private finishBallDrag (event?: PointerEvent): void {
        const drag = this.ballDrag
        if (!drag || (event && drag.pointerId !== event.pointerId)) {
            return
        }
        if (event?.type === 'pointerup') {
            this.updateBallPosition(event, drag)
        }
        this.releaseBallDrag(drag)
        if (!this.movingBall) {
            return
        }
        this.movingBall = false
        if (!this.pinned && !this.managing) {
            this.close()
        }
        try {
            window.localStorage.setItem(positionKey, JSON.stringify(this.ballPosition))
        } catch {
            this.notifications.info('Quick Buttons moved. This window could not save its position.')
        }
    }

    private releaseBallDrag (drag: BallDrag): void {
        this.ballDrag = null
        drag.removeListeners()
        if (drag.handle.hasPointerCapture(drag.pointerId)) {
            drag.handle.releasePointerCapture(drag.pointerId)
        }
    }

    togglePinned (): void {
        if (!this.activeTerminal) {
            this.notifications.info('Open a terminal to use Quick Buttons.')
            return
        }
        if (this.busy || this.editor) {
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
        if (!terminal || this.expanded || this.busy || this.ballDrag) {
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
            if (this.pinned || this.managing || this.ballDrag) {
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
        this.editorOpener = undefined
        this.error = ''
        this.endCommandDrag()
        if (this.ballDrag) {
            this.releaseBallDrag(this.ballDrag)
        }
        this.movingBall = false
    }

    ngOnDestroy (): void {
        this.close()
    }

    leave (): void {
        if (!this.managing && !this.pinned && !this.ballDrag) {
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
        if (this.editor) {
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
        if (!command.text.trim() || invalidCommandCharacters.test(command.text)) {
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
        const currentEntries = this.entriesAt(scope.entries, parentPath)
        const destinations = this.groupLocations().filter(group => group.entries !== currentEntries)
        this.setEditor({ scope, parentPath, index, entry, deleting: false, move: { destinations, selected: -1 } }, event)
    }

    hasMoveDestination (scope: VisibleScope, path: number[]): boolean {
        return path.length > 0 || this.scopes.length > 1 || scope.entries.some(entry => entry.kind === 'group')
    }

    private setEditor (editor: Omit<Editor, 'location'>, event?: MouseEvent): void {
        const names = [editor.scope.title]
        let entries = editor.scope.entries
        for (const index of editor.parentPath) {
            const group = entries[index]
            if (group?.kind !== 'group') {
                break
            }
            names.push(group.title)
            entries = group.entries
        }
        this.error = ''
        this.editorOpener = event?.currentTarget as HTMLElement | undefined
        this.editor = { ...editor, location: names.join(' / ') }
    }

    cancelEdit (): void {
        const opener = this.editorOpener
        this.editor = null
        this.editorOpener = undefined
        this.error = ''
        if (opener) {
            requestAnimationFrame(() => {
                if (this.managing && !this.editor) {
                    const target = opener.isConnected ? opener : this.doneButton?.nativeElement
                    target?.focus({ preventScroll: true })
                }
            })
        }
    }

    startCommandDrag (event: DragEvent, scope: VisibleScope, parentPath: number[], entries: Entry[], index: number): void {
        if (!this.managing || this.editor || this.busy || !event.dataTransfer) {
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
        if (!this.managing || !this.expanded || this.editor || this.busy) {
            return
        }
        await this.moveCommand(drag, scope, path, position.insertAt)
    }

    private async moveCommand (origin: CommandPosition, scope: VisibleScope, path: number[], requestedIndex?: number): Promise<void> {
        const source = this.copyScope(origin.scope)
        const destination = origin.scope === scope ? source : this.copyScope(scope)
        const from = this.entriesAt(source.entries, origin.parentPath)
        const to = this.entriesAt(destination.entries, path)
        const command = from?.[origin.index]
        if (!from || !to || command?.kind !== 'command') {
            this.error = 'The command or group is missing. Start the move again.'
            return
        }
        const index = requestedIndex ?? to.length
        const insertAt = index - Number(from === to && origin.index < index)
        from.splice(origin.index, 1)
        to.splice(insertAt, 0, command)
        const changes = destination === source
            ? new Map([[scope, source]])
            : new Map([[origin.scope, source], [scope, destination]])
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
            (!entry.text.trim() || invalidCommandCharacters.test(entry.text))))) {
            this.error = entry.kind === 'group' ? 'Enter a group name.' : 'Enter an alias and a single line of terminal text.'
            return
        }

        const updated = this.copyScope(scope)
        const entries = this.entriesAt(updated.entries, parentPath)
        if (!entries) {
            this.error = 'The original group is missing. Start the edit again.'
            return
        }

        if (deleting && index !== undefined) {
            entries.splice(index, 1)
        } else {
            const title = entry.title.trim()
            if (index === undefined) {
                entries.push({ ...entry, title })
            } else {
                const existing = entries[index]
                if (existing.kind === 'group') {
                    existing.title = title
                } else {
                    entries[index] = { ...entry, title }
                }
            }
        }

        await this.persist(new Map([[scope, updated]]))
    }

    private copyScope (scope: VisibleScope): Scope {
        return { profileId: scope.profileId, entries: this.copyEntries(scope.entries) }
    }

    private copyEntries (entries: Entry[]): Entry[] {
        return entries.map(entry => {
            if (entry.kind === 'command') {
                return entry
            }
            const group = { ...entry, entries: this.copyEntries(entry.entries) }
            this.groupKeys.set(group, this.groupKey(entry))
            return group
        })
    }

    private groupKey (group: Group): symbol {
        let key = this.groupKeys.get(group)
        if (!key) {
            key = Symbol()
            this.groupKeys.set(group, key)
        }
        return key
    }

    private entriesAt (entries: Entry[], path: number[]): Entry[] | undefined {
        for (const index of path) {
            const group = entries[index]
            if (group?.kind !== 'group') {
                return undefined
            }
            entries = group.entries
        }
        return entries
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

        this.busy = true
        this.error = ''
        settings.scopes = next
        try {
            await this.config.save()
        } catch {
            this.zone.run(() => {
                this.busy = false
                if (this.settings === settings && (settings.scopes === next || (!next.length && !settings.scopes.length))) {
                    settings.scopes = previous
                }
                this.error = 'Could not save the Tabby configuration. Try again.'
            })
            return
        }
        this.zone.run(() => {
            this.busy = false
            this.cancelEdit()
            this.refreshScopes()
        })
    }

    private refreshScopes (): void {
        const profile = this.target?.profile
        const scopes: Pick<VisibleScope, 'profileId' | 'title'>[] = [{ profileId: null, title: 'Shared' }]
        if (profile?.id) {
            scopes.push({ profileId: profile.id, title: profile.name || profile.id })
        }
        this.scopes = scopes.map(scope => {
            const saved = this.settings.scopes.find(item => item.profileId === scope.profileId)
            return { ...scope, saved, entries: saved?.entries ?? [] }
        })
    }

    trackScope (_index: number, scope: VisibleScope): string | null {
        return scope.profileId
    }
}
