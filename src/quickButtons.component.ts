import { Component, Inject, OnDestroy } from '@angular/core'
import { Subscription } from 'rxjs'
import { AppService, ConfigService, SplitTabComponent } from 'tabby-core'
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

const invalidCommandCharacters = /[\x00-\x1f\x7f-\x9f]/

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
    private panelContext?: Subscription

    constructor (
        @Inject(AppService) private readonly app: AppService,
        @Inject(ConfigService) private readonly config: ConfigService,
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

    open (): void {
        const terminal = this.activeTerminal
        if (!terminal || this.expanded || this.busy) {
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
        this.editor = null
        this.error = ''
    }

    ngOnDestroy (): void {
        this.panelContext?.unsubscribe()
    }

    leave (): void {
        if (!this.managing) {
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
        this.close()
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

        const settings = this.settings
        const previous = settings.scopes
        const existing = previous.find(item => item.profileId === scope.profileId)
        if (existing !== scope.saved) {
            this.refreshScopes()
            this.editor = null
            this.error = 'Shortcuts changed elsewhere. Start the edit again.'
            return
        }

        const updated: Scope = { profileId: scope.profileId, entries: structuredClone(scope.entries) }
        let entries = updated.entries
        for (const groupIndex of parentPath) {
            const group = entries[groupIndex]
            if (group?.kind !== 'group') {
                this.error = 'The original group is missing. Start the edit again.'
                return
            }
            entries = group.entries
        }

        if (deleting && index !== undefined) {
            entries.splice(index, 1)
        } else {
            const savedEntry = { ...structuredClone(entry), title: entry.title.trim() }
            if (index === undefined) {
                entries.push(savedEntry)
            } else {
                entries[index] = savedEntry
            }
        }

        const next = previous.filter(item => item.profileId !== scope.profileId)
        if (updated.entries.length) {
            next.push(updated)
        }

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
}
