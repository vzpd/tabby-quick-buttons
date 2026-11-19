import { Component, HostListener, Inject, OnDestroy } from '@angular/core'
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
}

interface DraggedCommand {
    scope: VisibleScope
    parentPath: number[]
    entries: Entry[]
    index: number
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
    pointer: Position
    origin: Position
    listeners: AbortController
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
    private ballPosition = this.loadBallPosition()
    private ballDrag: BallDrag | null = null
    private viewport = { width: window.innerWidth, height: window.innerHeight }
    private panelContext?: Subscription
    private readonly groupKeys = new WeakMap<Group, symbol>()
    readonly trackEntry = (_index: number, entry: Entry): Command | symbol =>
        entry.kind === 'group' ? this.groupKey(entry) : entry

    constructor (
        @Inject(AppService) private readonly app: AppService,
        @Inject(ConfigService) private readonly config: ConfigService,
        @Inject(NotificationsService) private readonly notifications: NotificationsService,
    ) {}

    get activeTerminal (): Terminal | null {
        const tab = this.app.activeTab
        const pane = tab instanceof SplitTabComponent ? tab.getFocusedTab() : tab
        return pane instanceof BaseTerminalTabComponent ? pane : null
    }

    get expanded (): boolean {
        return this.target !== null && this.target === this.activeTerminal
    }

    get draggingBall (): boolean {
        return this.ballDrag !== null
    }

    private get settings (): QuickButtonsConfig {
        return this.config.store.quickButtons
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
        this.ballDrag?.listeners.abort()
        const { x, y } = this.layout
        const listeners = new AbortController()
        this.ballDrag = {
            pointerId: event.pointerId,
            pointer: { x: event.clientX, y: event.clientY },
            origin: { x, y },
            listeners,
        }
        const options = { capture: true, signal: listeners.signal }
        window.addEventListener('pointermove', move => this.moveBall(move), options)
        window.addEventListener('pointerup', up => this.finishBallDrag(up), options)
        window.addEventListener('pointercancel', cancel => this.finishBallDrag(cancel), options)
        window.addEventListener('blur', () => this.finishBallDrag(), { signal: listeners.signal })
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
        if (!this.ballDrag || (event && this.ballDrag.pointerId !== event.pointerId)) {
            return
        }
        this.ballDrag.listeners.abort()
        this.ballDrag = null
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

    togglePinned (): void {
        if (!this.activeTerminal) {
            this.notifications.info('Open a terminal to use Quick Buttons.')
            return
        }
        if (this.busy) {
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
        if (!terminal || this.expanded || this.busy || this.draggingBall) {
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
        if (tab instanceof SplitTabComponent) {
            this.panelContext.add(tab.focusChanged$.subscribe(pane => {
                if (pane !== terminal) {
                    this.close()
                }
            }))
        }
    }

    close (): void {
        this.panelContext?.unsubscribe()
        this.target = null
        this.managing = false
        this.pinned = false
        this.editor = null
        this.error = ''
        this.endCommandDrag()
        this.ballDrag?.listeners.abort()
        this.ballDrag = null
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

    add (scope: VisibleScope, parentPath: number[], kind: Entry['kind']): void {
        const entry: Entry = kind === 'group'
            ? { kind, title: '', entries: [] }
            : { kind, title: '', text: '', sendEnter: true }
        this.setEditor({ scope, parentPath, entry, deleting: false })
    }

    edit (scope: VisibleScope, parentPath: number[], index: number, entry: Entry, deleting = false): void {
        this.setEditor({ scope, parentPath, index, entry: { ...entry }, deleting })
    }

    private setEditor (editor: Editor): void {
        this.error = ''
        this.editor = editor
    }

    cancelEdit (): void {
        this.editor = null
        this.error = ''
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
        const source = this.copyScope(drag.scope)
        const destination = drag.scope === scope ? source : this.copyScope(scope)
        const from = this.entriesAt(source.entries, drag.parentPath)
        const to = this.entriesAt(destination.entries, path)
        const command = from?.[drag.index]
        if (!from || !to || command?.kind !== 'command') {
            this.error = 'The command or group is missing. Start the move again.'
            return
        }
        const insertAt = position.insertAt - Number(from === to && drag.index < position.insertAt)
        from.splice(drag.index, 1)
        to.splice(insertAt, 0, command)
        const changes = destination === source
            ? new Map([[scope, source]])
            : new Map([[drag.scope, source], [scope, destination]])
        await this.persist(changes)
    }

    async save (): Promise<void> {
        const editor = this.editor
        if (!editor || this.busy) {
            return
        }

        const { scope, parentPath, index, entry, deleting } = editor
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
                this.editor = null
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
            this.editor = null
            this.refreshScopes()
        } catch {
            if (this.settings === settings && (settings.scopes === next || (!next.length && !settings.scopes.length))) {
                settings.scopes = previous
            }
            this.error = 'Could not save the Tabby configuration. Try again.'
        } finally {
            this.busy = false
        }
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
