export const template = `
<div class="dock" *ngIf="activeTerminal && layout as position"
     [style.left.px]="position.x" [style.top.px]="position.y"
     (pointerenter)="open()" (pointerleave)="leave()"
     (keydown.escape)="$event.stopPropagation(); escape()">
    <div *ngIf="draggingBall" class="ball-drag-surface" aria-hidden="true"></div>
    <div class="ball btn btn-primary" [class.moving]="movingBall"
         [class.integrated]="expanded && !movingBall" aria-hidden="true"
         title="Quick Buttons · Drag to move" (pointerdown)="startBallDrag($event)">
        <svg viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="2"
             stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m4 7 5 5-5 5m8 0h7"/></svg>
    </div>

    <div class="panel-position" *ngIf="expanded && !movingBall" [class.below]="position.below"
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
                            [disabled]="busy || !!editor" (click)="finishManagement()">Done</button>
                </div>
            </header>
            <p *ngIf="managing && !editor" class="move-hint" aria-live="polite">
                {{ busy ? 'Saving shortcuts…' : 'Drag to reorder or move between groups.' }}
            </p>

            <form *ngIf="editor as draft" class="editor" (submit)="$event.preventDefault(); save()" [attr.aria-busy]="busy">
                <div class="editor-heading">
                    <strong *ngIf="!draft.deleting">
                        {{ draft.index === undefined ? 'Add' : 'Edit' }} {{ draft.entry.kind }}
                    </strong>
                    <strong *ngIf="draft.deleting">Delete “{{ draft.entry.title }}”?</strong>
                    <div class="editor-location">{{ draft.location }}</div>
                </div>
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
                <p class="error text-danger" *ngIf="error" role="alert">{{ error }}</p>
                <div class="actions">
                    <ng-template #cancelButton><button type="button" class="btn btn-sm btn-outline-secondary"
                              [disabled]="busy" (click)="cancelEdit()">Cancel</button></ng-template>
                    <button *ngIf="draft.deleting; else cancelButton" #editorFocus type="button"
                            class="btn btn-sm btn-outline-secondary" [disabled]="busy" (click)="cancelEdit()">Cancel</button>
                    <button type="submit" class="btn btn-sm" [disabled]="busy"
                            [class.btn-danger]="draft.deleting" [class.btn-primary]="!draft.deleting">
                        {{ busy ? 'Saving…' : draft.deleting ? 'Confirm deletion' :
                            draft.index === undefined ? 'Add ' + draft.entry.kind : 'Save changes' }}
                    </button>
                </div>
            </form>
            <p class="error text-danger" *ngIf="error && !editor" role="alert">{{ error }}</p>

            <div class="scope-list" [class.is-managing]="managing" [hidden]="!!editor">
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
                            <ng-container *ngTemplateOutlet="editActions"></ng-container>
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
                    <div class="actions" *ngIf="managing">
                        <ng-container *ngTemplateOutlet="editActions"></ng-container>
                    </div>
                </div>
            </ng-template>
            <ng-template #editActions>
                <button type="button" class="btn btn-sm btn-outline-secondary"
                        [disabled]="editor || busy" [attr.aria-label]="'Edit ' + entry.title"
                        (click)="edit(scope, path, index, entry, false, $event)">Edit</button>
                <button type="button" class="btn btn-sm btn-outline-danger"
                        [disabled]="editor || busy" [attr.aria-label]="'Delete ' + entry.title"
                        (click)="edit(scope, path, index, entry, true, $event)">Delete</button>
            </ng-template>
        </div>
    </div>
</ng-template>
`

export const styles = `
.dock {
    position: fixed;
    z-index: 1020;
}
.ball, .panel, .ball-drag-surface { -webkit-app-region: no-drag; }
.ball-drag-surface {
    position: fixed;
    inset: 0;
    z-index: 2;
    cursor: grabbing;
}
.ball {
    position: relative;
    z-index: 3;
    display: grid;
    place-items: center;
    place-content: center;
    border-radius: 50%;
    padding: 0;
    width: 52px;
    height: 52px;
    box-shadow: 0 0 0 2px var(--bs-body-bg, #252525), 0 4px 14px #0006;
    cursor: grab;
    touch-action: none;
    user-select: none;
}
.ball.moving { cursor: grabbing; }
.ball svg { pointer-events: none; }
.ball.integrated {
    border-color: transparent;
    border-radius: 8px;
    color: var(--bs-body-color);
    background: transparent;
    box-shadow: none;
}
.ball.integrated:hover { background: #80808026; }
.panel-position {
    position: absolute;
    bottom: 0;
}
.panel-position.below { top: 0; bottom: auto; }
.panel {
    display: flex;
    flex-direction: column;
    border: 1px solid var(--bs-border-color, #555);
    border-radius: 8px;
    color: var(--bs-body-color);
    background: var(--bs-body-bg, #252525);
    box-shadow: 0 6px 24px #0004;
    overflow: hidden;
}
.panel-header, .row-heading, .command-row, .actions {
    display: flex;
    align-items: center;
    gap: 8px;
}
.panel-header {
    order: 1;
    flex: none;
    justify-content: space-between;
    min-height: 52px;
    padding: 6px 12px 6px 58px;
    border-top: 1px solid var(--bs-border-color, #555);
}
.panel-position.below .panel-header {
    order: 0;
    border-top: none;
    border-bottom: 1px solid var(--bs-border-color, #555);
}
.panel-position.anchor-right .panel-header { padding: 6px 58px 6px 12px; }
.move-hint { margin: 0; padding: 8px 12px; font-size: .85em; background: #80808012; }
.scope-list { min-height: 0; overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; padding: 4px 12px 10px; }
.scope-list[hidden] { display: none; }
.scope { padding: 8px 0; }
.scope + .scope { border-top: 1px solid var(--bs-border-color, #555); }
.row-heading { margin-bottom: 5px; }
.scope-title, .group-title, .command-alias { overflow-wrap: anywhere; }
.scope-tag { flex: none; opacity: .72; font-size: .8em; }
.empty { margin: 3px 0; opacity: .75; font-size: .9em; }
.profile-hint { padding-bottom: 4px; }
.entries { display: flex; flex-wrap: wrap; gap: 5px; }
.entry { min-width: 0; max-width: 100%; }
.entry.is-group, .entries.managing > .entry { flex: 0 0 100%; }
summary { display: flex; align-items: center; gap: 6px; cursor: pointer; padding: 4px; }
summary::-webkit-details-marker { display: none; }
summary::before { content: '▸'; flex: none; }
details[open] > summary::before { transform: rotate(90deg); }
.group-title { flex: 1; min-width: 0; }
.actions.group-controls { flex: none; flex-wrap: nowrap; }
.row-heading { padding: 3px 4px; }
.is-managing .row-heading { background: #8080801a; border-radius: 5px; padding: 5px 8px; }
.is-managing summary { padding-block: 5px; }
.is-managing summary:hover { background: #80808017; border-radius: 5px; }
.drop-ready { outline: 1px dashed var(--bs-primary, #9689eb); border-radius: 4px; }
.row-heading.drop-active, summary.drop-active {
    background: var(--bs-primary-bg-subtle, #80808040);
    outline-style: solid;
}
.nested {
    border-left: 1px solid var(--bs-border-color, #555);
    margin-left: 5px;
    padding-left: 9px;
}
.command-row { position: relative; justify-content: space-between; min-height: 30px; }
.command-row.drop-before::before,
.command-row.drop-after::after {
    content: '';
    position: absolute;
    inset-inline: 0;
    height: 2px;
    background: var(--bs-primary, #9689eb);
    pointer-events: none;
}
.command-row.drop-before::before { top: -3px; }
.command-row.drop-after::after { bottom: -3px; }
.command-drag { display: flex; align-items: center; gap: 6px; min-width: 0; }
.command-drag[draggable="true"] { cursor: grab; user-select: none; }
.managing .command-row { padding: 3px 4px 3px 6px; border-radius: 5px; }
.managing .command-row:hover { background: #80808012; }
.command-label { display: grid; line-height: 1.25; }
.insert-only { color: var(--bs-secondary-color, inherit); font-size: .76em; }
.grip { opacity: .68; }
.command-run {
    display: block;
    max-width: 100%;
    padding: 3px 8px;
    text-align: left;
    color: inherit;
    background: #80808017;
    border: 1px solid #80808052;
    border-radius: 4px;
}
.command-run:hover:not(:disabled) { background: #80808030; }
.command-run:disabled { opacity: .5; }
.actions { flex-wrap: wrap; }
.command-row > .actions { flex: none; }
.group-actions { margin: 5px 0 7px; gap: 5px; }
.editor {
    display: grid;
    gap: 11px;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: 12px;
}
.editor-heading { padding-bottom: 8px; border-bottom: 1px solid var(--bs-border-color, #555); }
.editor-heading strong { overflow-wrap: anywhere; }
.editor-location { font-size: .85em; color: var(--bs-secondary-color, inherit); overflow-wrap: anywhere; }
.editor label { display: grid; gap: 4px; margin: 0; }
.editor .enter-option { display: flex; align-items: center; gap: 6px; }
.editor .actions { justify-content: flex-end; }
.command-input { font-family: ui-monospace, monospace; }
.error { margin: 6px 12px; }
.editor .error, .delete-impact { margin: 0; }
`
