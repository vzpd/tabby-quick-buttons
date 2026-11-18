export const template = `
<div class="dock" *ngIf="activeTerminal"
     (pointerenter)="open()" (pointerleave)="leave()"
     (keydown.escape)="$event.stopPropagation(); close()">
    <button type="button" class="ball btn btn-secondary" aria-label="Quick commands"
            title="Quick commands" [attr.aria-expanded]="expanded" (click)="open()">
        <span aria-hidden="true">›_</span>
    </button>

    <div class="panel-position" *ngIf="expanded">
        <section class="panel" aria-label="Quick commands panel">
            <header class="panel-header">
                <strong>Quick commands</strong>
                <button *ngIf="!managing" type="button" class="btn btn-sm btn-outline-secondary"
                        (click)="managing = true">Manage</button>
                <button *ngIf="managing" type="button" class="btn btn-sm btn-outline-secondary"
                        [disabled]="busy" (click)="close()">Done</button>
            </header>

            <form *ngIf="editor as draft" class="editor" (submit)="$event.preventDefault(); save()">
                <ng-container *ngIf="!draft.deleting; else deletePrompt">
                    <label>
                        {{ draft.entry.kind === 'group' ? 'Group name' : 'Command alias' }}
                        <input class="form-control form-control-sm" required [disabled]="busy"
                               [value]="draft.entry.title" (input)="draft.entry.title = $any($event.target).value">
                    </label>
                    <label *ngIf="draft.entry.kind === 'command'">
                        Command text
                        <input class="form-control form-control-sm command-input" required autocomplete="off"
                               spellcheck="false" [disabled]="busy" [value]="draft.entry.text"
                               (input)="draft.entry.text = $any($event.target).value">
                    </label>
                    <label *ngIf="draft.entry.kind === 'command'" class="enter-option">
                        <input type="checkbox" [disabled]="busy" [checked]="draft.entry.sendEnter !== false"
                               (change)="draft.entry.sendEnter = $any($event.target).checked">
                        Press Enter after inserting
                    </label>
                </ng-container>
                <ng-template #deletePrompt>
                    <div>Delete “{{ draft.entry.title }}”?</div>
                    <div *ngIf="draft.entry.kind === 'group' && draft.entry.entries.length">
                        This also deletes its commands and subgroups.
                    </div>
                </ng-template>
                <div class="actions">
                    <button type="button" class="btn btn-sm btn-outline-secondary" [disabled]="busy"
                            (click)="cancelEdit()">Cancel</button>
                    <button type="submit" class="btn btn-sm" [disabled]="busy"
                            [class.btn-danger]="draft.deleting" [class.btn-primary]="!draft.deleting">
                        {{ draft.deleting ? 'Confirm deletion' : 'Save' }}
                    </button>
                </div>
            </form>
            <p class="error text-danger" *ngIf="error" role="alert">{{ error }}</p>

            <div class="scope-list">
                <section class="scope" *ngFor="let scope of scopes">
                    <div class="row-heading">
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
        <button type="button" class="btn btn-sm btn-outline-secondary"
                [disabled]="editor || busy" (click)="add(scope, path, 'command')">Add command</button>
        <button type="button" class="btn btn-sm btn-outline-secondary"
                [disabled]="editor || busy" (click)="add(scope, path, 'group')">Add group</button>
    </div>
    <p *ngIf="!entries.length && !managing" class="empty">No commands yet</p>
    <div *ngFor="let entry of entries; let index = index" class="entry">
        <ng-container *ngIf="entry.kind === 'group'; else command">
            <details open>
                <summary>{{ entry.title }}</summary>
                <div class="nested">
                    <div class="actions group-actions" *ngIf="managing">
                        <ng-container *ngTemplateOutlet="editActions"></ng-container>
                    </div>
                    <ng-container *ngTemplateOutlet="entryList; context: {
                        $implicit: entry.entries, scope: scope, path: path.concat(index)
                    }"></ng-container>
                </div>
            </details>
        </ng-container>
        <ng-template #command>
            <div class="command-row">
                <span class="command-alias" *ngIf="managing">{{ entry.title }}</span>
                <button *ngIf="!managing" type="button" class="command-run"
                        [disabled]="!target?.session?.open" (click)="execute(entry, scope)">
                    <span aria-hidden="true" class="prompt">›</span>
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
                    (click)="edit(scope, path, index, entry)">Edit</button>
            <button type="button" class="btn btn-sm btn-outline-danger"
                    [disabled]="editor || busy" [attr.aria-label]="'Delete ' + entry.title"
                    (click)="edit(scope, path, index, entry, true)">Delete</button>
        </ng-template>
    </div>
</ng-template>
`

export const styles = `
.dock {
    position: fixed;
    right: 24px;
    bottom: 16px;
    z-index: 1020;
}
.ball {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    padding: 0;
    font: 600 16px ui-monospace, monospace;
    opacity: .75;
}
.ball:hover, .ball:focus-visible, .ball[aria-expanded="true"] { opacity: 1; }
.panel-position {
    position: absolute;
    right: 0;
    bottom: 100%;
    padding-bottom: 8px;
    width: min(360px, calc(100vw - 40px));
}
.panel {
    display: flex;
    flex-direction: column;
    max-height: min(570px, calc(100vh - 78px));
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
.panel-header { justify-content: space-between; padding: 10px 12px; }
.panel-header, .editor { border-bottom: 1px solid var(--bs-border-color, #555); }
.scope-list { min-height: 0; overflow: auto; overscroll-behavior: contain; padding: 4px 12px 10px; }
.scope { padding: 8px 0; }
.scope + .scope { border-top: 1px solid var(--bs-border-color, #555); }
.row-heading { margin-bottom: 5px; }
.scope-title, summary, .command-alias { overflow-wrap: anywhere; }
.scope-tag { flex: none; opacity: .72; font-size: .8em; }
.empty { margin: 3px 0; opacity: .75; font-size: .9em; }
.profile-hint { padding-bottom: 4px; }
.entry { margin-top: 3px; }
summary { cursor: pointer; padding: 4px 0; }
.nested {
    border-left: 1px solid var(--bs-border-color, #555);
    margin-left: 5px;
    padding-left: 9px;
}
.command-row { justify-content: space-between; min-height: 30px; }
.command-run {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    width: 100%;
    padding: 4px 6px;
    text-align: left;
    color: inherit;
    background: transparent;
    border: 0;
    border-radius: 4px;
}
.command-run:hover:not(:disabled) { background: #80808030; }
.command-run:disabled { opacity: .5; }
.prompt { font-family: ui-monospace, monospace; opacity: .7; }
.actions { flex-wrap: wrap; }
.command-row > .actions { flex: none; }
.group-actions { margin: 4px 0; }
.editor { display: grid; gap: 7px; padding: 8px 12px; }
.editor label { display: grid; gap: 3px; margin: 0; }
.editor .enter-option { display: flex; align-items: center; gap: 6px; }
.editor .actions { justify-content: flex-end; }
.command-input { font-family: ui-monospace, monospace; }
.error { margin: 6px 12px; }
@media (max-height: 420px) {
    .panel { display: block; overflow: auto; overscroll-behavior: contain; }
    .scope-list { overflow: visible; }
}
`
