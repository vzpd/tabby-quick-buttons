export const template = `
<div #dock class="dock" *ngIf="activeTerminal && layout as position"
     [class.auto-hide]="!pinned && !managing"
     [style.left.px]="position.x" [style.top.px]="position.y"
     (mouseenter)="open()" (mouseleave)="leave()"
     (keydown.escape)="$event.stopPropagation(); escape()">
    <ng-template #ballIcon>
        <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 7 5 5-5 5m8 0h7"/></svg>
    </ng-template>
    <ng-container *ngIf="buttonAppearance as appearance">
        <div class="ball btn btn-primary" [class.moving]="movingBall"
             [class.integrated]="expanded && !movingBall" aria-hidden="true"
             [style.--quick-buttons-ball-color]="appearance.color"
             [style.--quick-buttons-ball-ink]="buttonInk(appearance.color)"
             [style.--quick-buttons-ball-opacity]="appearance.opacity / 100"
             title="Quick Buttons · Drag to move"
             (pointerdown)="startBallDrag($event)">
            <ng-container *ngTemplateOutlet="ballIcon"></ng-container>
        </div>
    </ng-container>

    <div class="panel-position" *ngIf="expanded" [class.drag-hidden]="movingBall" [class.below]="position.below"
         [class.anchor-right]="position.anchorRight"
         [style.left.px]="position.panelOffset" [style.width.px]="position.panelWidth">
        <section class="panel" aria-label="Quick commands panel" [style.max-height.px]="position.panelHeight">
            <header class="panel-header">
                <strong>{{ managing ? 'Manage shortcuts' : 'Quick Buttons' }}</strong>
                <div class="actions">
                    <button type="button" class="btn btn-sm"
                            [class.btn-primary]="pinned" [class.btn-outline-secondary]="!pinned"
                            [attr.aria-pressed]="pinned" title="Keep the panel open"
                            (click)="pinned = !pinned">Pin</button>
                    <button *ngIf="!managing" type="button" class="btn btn-sm btn-outline-secondary"
                            (click)="managing = true">Manage</button>
                    <button *ngIf="!managing" type="button" class="btn btn-sm btn-outline-secondary" aria-label="Close Quick Buttons"
                            (click)="close()">×</button>
                    <button *ngIf="managing" #doneButton type="button" class="btn btn-sm btn-outline-secondary"
                            [disabled]="busy || editing" (click)="finishManagement()">Done</button>
                </div>
            </header>
            <div *ngIf="!editing" class="search-bar">
                <input #searchInput type="search" class="form-control form-control-sm" aria-label="Search shortcuts"
                       placeholder="Search by alias" autocomplete="off" [value]="searchQuery"
                       (input)="searchQuery = searchInput.value">
                <button *ngIf="searchQuery" type="button" class="btn btn-sm btn-outline-secondary"
                        aria-label="Clear search" (click)="searchQuery = ''; searchInput.focus()">×</button>
            </div>
            <div *ngIf="managing" class="move-hint manage-tools" [hidden]="editing">
                <span aria-live="polite">
                    {{ busy ? 'Saving…' : searchQuery.trim() ? 'Use Move… to change groups.' :
                        'Drag to reorder or move between groups.' }}
                </span>
                <button type="button" class="btn btn-sm btn-outline-secondary"
                        [disabled]="busy" (click)="editAppearance($event)">Appearance</button>
            </div>

            <form *ngIf="appearanceDraft as draft" class="editor" (submit)="$event.preventDefault(); saveAppearance()"
                  [attr.aria-busy]="busy">
                <div class="editor-heading"><strong>Floating button appearance</strong></div>
                <div class="appearance-preview">
                    <span class="ball preview-ball btn btn-primary" aria-hidden="true"
                          [style.--quick-buttons-ball-color]="draft.color"
                          [style.--quick-buttons-ball-ink]="buttonInk(draft.color)"
                          [style.--quick-buttons-ball-opacity]="draft.opacity / 100">
                        <ng-container *ngTemplateOutlet="ballIcon"></ng-container>
                    </span>
                    <span>Preview</span>
                </div>
                <label class="color-setting">
                    <span>Color <small>{{ draft.color ?? 'Tabby theme' }}</small></span>
                    <input #editorFocus type="color" [value]="draft.color ?? '#4176d5'"
                           [disabled]="busy" (input)="draft.color = $any($event.target).value">
                </label>
                <label>
                    <span>Opacity <output>{{ draft.opacity }}%</output></span>
                    <input type="range" min="0" max="100" step="1" [value]="draft.opacity"
                           [disabled]="busy" (input)="draft.opacity = +$any($event.target).value">
                </label>
                <p class="error text-danger" *ngIf="error" role="alert">{{ error }}</p>
                <div class="actions">
                    <button type="button" class="btn btn-sm btn-outline-secondary reset-appearance"
                            [disabled]="busy" (click)="resetAppearance()">Reset defaults</button>
                    <button type="button" class="btn btn-sm btn-outline-secondary"
                            [disabled]="busy" (click)="cancelEdit()">Cancel</button>
                    <button type="submit" class="btn btn-sm btn-primary" [disabled]="busy">
                        {{ busy ? 'Saving…' : 'Save changes' }}
                    </button>
                </div>
            </form>

            <form *ngIf="editor as draft" class="editor" (submit)="$event.preventDefault(); save()" [attr.aria-busy]="busy">
                <div class="editor-heading">
                    <strong *ngIf="!draft.deleting">
                        {{ draft.move ? 'Move “' + draft.entry.title + '”' :
                            (draft.index === undefined ? 'Add ' : 'Edit ') + draft.entry.kind }}
                    </strong>
                    <strong *ngIf="draft.deleting">Delete “{{ draft.entry.title }}”?</strong>
                    <div class="editor-location">{{ draft.location }}</div>
                </div>
                <label *ngIf="draft.move as move; else standardEditor">
                    Destination
                    <select #editorFocus class="form-select form-select-sm" required [disabled]="busy"
                            (change)="move.selected = +$any($event.target).value" [value]="move.selected">
                        <option value="-1" disabled>Choose a group</option>
                        <option *ngFor="let target of move.destinations; let index = index" [value]="index">
                            {{ target.location }}
                        </option>
                    </select>
                </label>
                <ng-template #standardEditor>
                    <ng-container *ngIf="!draft.deleting; else deletePrompt">
                        <label>
                            {{ draft.entry.kind === 'group' ? 'Group name' : 'Command alias' }}
                            <input #editorFocus class="form-control form-control-sm" required [disabled]="busy"
                                   [value]="draft.entry.title" (input)="draft.entry.title = $any($event.target).value">
                        </label>
                        <label *ngIf="draft.entry.kind === 'command'">
                            Command text
                            <input class="form-control form-control-sm command-input" required autocomplete="off"
                                   spellcheck="false" autocapitalize="off" [disabled]="busy" [value]="draft.entry.text"
                                   (input)="draft.entry.text = $any($event.target).value">
                        </label>
                        <label *ngIf="draft.entry.kind === 'command'" class="enter-option">
                            <input type="checkbox" [disabled]="busy" [checked]="draft.entry.sendEnter !== false"
                                   (change)="draft.entry.sendEnter = $any($event.target).checked">
                            Press Enter after inserting
                        </label>
                    </ng-container>
                    <ng-template #deletePrompt>
                        <p class="delete-impact" *ngIf="draft.entry.kind === 'group' && draft.entry.entries.length">
                            This also deletes its commands and subgroups.
                        </p>
                    </ng-template>
                </ng-template>
                <p class="error text-danger" *ngIf="error" role="alert">{{ error }}</p>
                <div class="actions">
                    <ng-template #cancelButton><button type="button" class="btn btn-sm btn-outline-secondary"
                              [disabled]="busy" (click)="cancelEdit()">Cancel</button></ng-template>
                    <button *ngIf="draft.deleting; else cancelButton" #editorFocus type="button"
                            class="btn btn-sm btn-outline-secondary" [disabled]="busy" (click)="cancelEdit()">Cancel</button>
                    <button type="submit" class="btn btn-sm" [disabled]="busy || (draft.move && draft.move.selected < 0)"
                            [class.btn-danger]="draft.deleting" [class.btn-primary]="!draft.deleting">
                        {{ busy ? 'Saving…' : draft.move ? 'Move command' : draft.deleting ? 'Confirm deletion' :
                            draft.index === undefined ? 'Add ' + draft.entry.kind : 'Save changes' }}
                    </button>
                </div>
            </form>
            <p class="error text-danger" *ngIf="error && !editing" role="alert">{{ error }}</p>

            <div class="scope-list" [class.is-managing]="managing" [hidden]="editing">
                <div *ngIf="searchQuery.trim()" class="search-results">
                    <ng-container *ngIf="searchResults as matches">
                        <p *ngIf="!matches.length" class="empty" role="status">No shortcuts match this alias.</p>
                        <div *ngFor="let match of matches; trackBy: trackMatch" class="search-result command-row">
                            <button *ngIf="!managing; else manageResult" type="button" class="command-run"
                                    [disabled]="!target?.session?.open" (click)="execute(match.entry, match.scope)">
                                <span class="command-alias">{{ match.entry.title }}</span>
                                <small class="result-location">{{ match.location }}</small>
                            </button>
                            <ng-template #manageResult>
                                <span class="command-label">
                                    <span class="command-alias">{{ match.entry.title }}</span>
                                    <small class="result-location">{{ match.location }}</small>
                                </span>
                                <ng-container *ngTemplateOutlet="rowActions; context: { $implicit: match.entry,
                                    scope: match.scope, path: match.parentPath, index: match.index }"></ng-container>
                            </ng-template>
                        </div>
                    </ng-container>
                </div>
                <div [hidden]="!!searchQuery.trim()">
                    <section class="scope" *ngFor="let scope of scopes; trackBy: trackScope">
                        <div class="row-heading"
                             [class.drop-ready]="dragged && dragged.entries !== scope.entries"
                             [class.drop-active]="dropTarget?.entries === scope.entries && dropTarget?.rowIndex === undefined"
                             (dragover)="dragOver($event, scope.entries)"
                             (dragleave)="dragLeave($event, scope.entries)"
                             (drop)="dropCommand($event, scope, [], scope.entries)">
                            <strong class="scope-title">{{ scope.title }}</strong>
                            <span class="scope-tag" *ngIf="scope.profileId !== null">Current profile</span>
                        </div>
                        <ng-container *ngTemplateOutlet="entryList; context: {
                            $implicit: scope.entries, scope: scope, path: []
                        }"></ng-container>
                    </section>
                    <p *ngIf="managing && scopes.length === 1" class="empty profile-hint">
                        Open a saved Tabby profile to create profile-specific groups.
                    </p>
                </div>
            </div>
        </section>
    </div>
</div>

<ng-template #entryList let-entries let-scope="scope" let-path="path">
    <div *ngIf="managing" class="actions group-actions">
        <button type="button" class="btn btn-sm btn-outline-secondary" aria-label="Add command"
                [disabled]="editor || busy" (click)="add(scope, path, 'command', $event)">+ Command</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" aria-label="Add group"
                [disabled]="editor || busy" (click)="add(scope, path, 'group', $event)">+ Group</button>
    </div>
    <p *ngIf="!entries.length && !managing" class="empty">No commands yet</p>
    <div class="entries" [class.managing]="managing">
        <div *ngFor="let entry of entries; let index = index; trackBy: trackEntry"
             class="entry" [class.is-group]="entry.kind === 'group'">
            <ng-container *ngIf="entry.kind === 'group'; else command">
                <details open>
                    <summary [class.drop-ready]="dragged && dragged.entries !== entry.entries"
                             [class.drop-active]="dropTarget?.entries === entry.entries && dropTarget?.rowIndex === undefined"
                             (dragover)="dragOver($event, entry.entries)"
                             (dragleave)="dragLeave($event, entry.entries)"
                             (drop)="dropCommand($event, scope, path.concat(index), entry.entries)">
                        <span class="group-title">{{ entry.title }}</span>
                        <span class="actions group-controls" *ngIf="managing">
                            <ng-container *ngTemplateOutlet="rowActions; context: {
                                $implicit: entry, scope: scope, path: path, index: index
                            }"></ng-container>
                        </span>
                    </summary>
                    <div class="nested">
                        <ng-container *ngTemplateOutlet="entryList; context: {
                            $implicit: entry.entries, scope: scope, path: path.concat(index)
                        }"></ng-container>
                    </div>
                </details>
            </ng-container>
            <ng-template #command>
                <div class="command-row"
                     [class.drop-before]="dropTarget?.entries === entries && dropTarget?.rowIndex === index && !dropTarget?.after"
                     [class.drop-after]="dropTarget?.entries === entries && dropTarget?.rowIndex === index && dropTarget?.after"
                     (dragover)="dragOver($event, entries, index)"
                     (dragleave)="dragLeave($event, entries, index)"
                     (drop)="dropCommand($event, scope, path, entries, index)">
                    <span class="command-drag" *ngIf="managing" [attr.draggable]="!editor && !busy"
                          (dragstart)="startCommandDrag($event, scope, path, entries, index)"
                          (dragend)="endCommandDrag()" title="Drag to reorder or move">
                        <span aria-hidden="true" class="grip">⠿</span>
                        <span class="command-label">
                            <span class="command-alias">{{ entry.title }}</span>
                            <small *ngIf="entry.sendEnter === false" class="insert-only">Insert only</small>
                        </span>
                    </span>
                    <button *ngIf="!managing" type="button" class="command-run"
                            [disabled]="!target?.session?.open" (click)="execute(entry, scope)">
                        <span class="command-alias">{{ entry.title }}</span>
                    </button>
                    <ng-container *ngIf="managing">
                        <ng-container *ngTemplateOutlet="rowActions; context: {
                            $implicit: entry, scope: scope, path: path, index: index
                        }"></ng-container>
                    </ng-container>
                </div>
            </ng-template>
        </div>
    </div>
</ng-template>

<ng-template #rowActions let-entry let-scope="scope" let-path="path" let-index="index">
    <span class="actions entry-actions">
        <button *ngIf="entry.kind === 'command' && hasMoveDestination(scope, path)" type="button"
                class="btn btn-sm btn-outline-secondary" [disabled]="editor || busy"
                [attr.aria-label]="'Move ' + entry.title"
                (click)="startMove(scope, path, index, entry, $event)">Move…</button>
        <button type="button" class="btn btn-sm btn-outline-secondary"
                [disabled]="editor || busy" [attr.aria-label]="'Edit ' + entry.title"
                (click)="edit(scope, path, index, entry, false, $event)">Edit</button>
        <button type="button" class="btn btn-sm btn-outline-danger"
                [disabled]="editor || busy" [attr.aria-label]="'Delete ' + entry.title"
                (click)="edit(scope, path, index, entry, true, $event)">Delete</button>
    </span>
</ng-template>
`
