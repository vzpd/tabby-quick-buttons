export interface Command {
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

export type Entry = Command | Group

export interface Scope {
    profileId: string | null
    entries: Entry[]
}

export interface QuickButtonsConfig {
    scopes: Scope[]
    floatingButtonColor?: string | null
    floatingButtonOpacity?: number
}

export interface VisibleScope extends Scope {
    title: string
    saved: Scope | undefined
}

export interface GroupLocation {
    scope: VisibleScope
    parentPath: number[]
    entries: Entry[]
    location: string
}

export interface CommandPosition {
    scope: VisibleScope
    parentPath: number[]
    index: number
}

export interface SearchResult extends CommandPosition {
    entry: Command
    location: string
}

export function isValidCommandText (text: string): boolean {
    return !!text.trim() && !/[\x00-\x1f\x7f-\x9f]/.test(text)
}

export function visibleScopes (scopes: Scope[], profile?: { id: string, name: string }): VisibleScope[] {
    const visible: Pick<VisibleScope, 'profileId' | 'title'>[] = [{ profileId: null, title: 'Shared' }]
    if (profile?.id) {
        visible.push({ profileId: profile.id, title: profile.name || profile.id })
    }
    return visible.map(scope => {
        const saved = scopes.find(item => item.profileId === scope.profileId)
        return { ...scope, saved, entries: saved?.entries ?? [] }
    })
}

export class ShortcutTree {
    private readonly groupKeys = new WeakMap<Group, symbol>()

    readonly trackEntry = (_index: number, entry: Entry): Command | symbol =>
        entry.kind === 'group' ? this.groupKey(entry) : entry

    search (scopes: VisibleScope[], text: string): SearchResult[] {
        const query = text.trim().toLocaleLowerCase()
        if (!query) {
            return []
        }
        return this.groups(scopes).flatMap(({ scope, parentPath, entries, location }) =>
            entries.flatMap((entry, index) => entry.kind === 'command' && entry.title.toLocaleLowerCase().includes(query)
                ? [{ scope, parentPath, index, entry, location }]
                : []),
        )
    }

    groups (scopes: VisibleScope[]): GroupLocation[] {
        const groups: GroupLocation[] = []
        const visit = (scope: VisibleScope, parentPath: number[], entries: Entry[], location: string): void => {
            groups.push({ scope, parentPath, entries, location })
            entries.forEach((entry, index) => {
                if (entry.kind === 'group') {
                    visit(scope, parentPath.concat(index), entry.entries, `${location} / ${entry.title}`)
                }
            })
        }
        scopes.forEach(scope => visit(scope, [], scope.entries, scope.title))
        return groups
    }

    location (scope: VisibleScope, path: number[]): string {
        const names = [scope.title]
        let entries = scope.entries
        for (const index of path) {
            const group = entries[index]
            if (group?.kind !== 'group') {
                break
            }
            names.push(group.title)
            entries = group.entries
        }
        return names.join(' / ')
    }

    entriesAt (entries: Entry[], path: number[]): Entry[] | undefined {
        for (const index of path) {
            const group = entries[index]
            if (group?.kind !== 'group') {
                return undefined
            }
            entries = group.entries
        }
        return entries
    }

    move (origin: CommandPosition, scope: VisibleScope, path: number[], requestedIndex?: number): Map<VisibleScope, Scope> | undefined {
        const source = this.copyScope(origin.scope)
        const destination = origin.scope === scope ? source : this.copyScope(scope)
        const from = this.entriesAt(source.entries, origin.parentPath)
        const to = this.entriesAt(destination.entries, path)
        const command = from?.[origin.index]
        if (!from || !to || command?.kind !== 'command') {
            return undefined
        }
        const index = requestedIndex ?? to.length
        const insertAt = index - Number(from === to && origin.index < index)
        from.splice(origin.index, 1)
        to.splice(insertAt, 0, command)
        return destination === source
            ? new Map([[scope, source]])
            : new Map([[origin.scope, source], [scope, destination]])
    }

    edit (scope: VisibleScope, path: number[], index: number | undefined, entry: Entry, deleting: boolean): Scope | undefined {
        const updated = this.copyScope(scope)
        const entries = this.entriesAt(updated.entries, path)
        if (!entries) {
            return undefined
        }
        if (index === undefined) {
            entries.push({ ...entry, title: entry.title.trim() })
            return updated
        }
        const existing = entries[index]
        if (existing?.kind !== entry.kind) {
            return undefined
        }
        if (deleting) {
            entries.splice(index, 1)
        } else if (existing.kind === 'group') {
            existing.title = entry.title.trim()
        } else {
            entries[index] = { ...entry, title: entry.title.trim() }
        }
        return updated
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
}
