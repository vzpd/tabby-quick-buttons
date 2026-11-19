export const styles = `
.dock {
    position: fixed;
    z-index: 1020;
}
.ball, .panel { -webkit-app-region: no-drag; }
.ball {
    background-color: var(--quick-buttons-ball-color, var(--bs-btn-bg, #4176d5));
    border-color: var(--quick-buttons-ball-color, var(--bs-btn-border-color, #4176d5));
    color: var(--quick-buttons-ball-ink, var(--bs-btn-color, #fff));
    opacity: var(--quick-buttons-ball-opacity, 1);
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
.dock:hover .ball.integrated, .dock:not(.auto-hide) .ball.integrated {
    border-color: transparent;
    border-radius: 8px;
    color: var(--bs-body-color);
    background: transparent;
    box-shadow: none;
    opacity: 1;
}
.dock .ball.integrated:hover { background: #80808026; }
.panel-position {
    position: absolute;
    bottom: 0;
}
.panel-position.below { top: 0; bottom: auto; }
.panel-position.drag-hidden, .dock.auto-hide:not(:hover) .panel-position { visibility: hidden; pointer-events: none; }
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
.manage-tools { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.manage-tools[hidden] { display: none; }
.search-bar { display: flex; gap: 6px; padding: 8px 12px; }
.search-bar input { min-width: 0; }
.search-bar input::-webkit-search-cancel-button { display: none; }
.search-results { display: grid; gap: 5px; padding-block: 3px; }
.search-result .command-run { width: 100%; }
.result-location { display: block; color: var(--bs-secondary-color, inherit); overflow-wrap: anywhere; }
.search-results .command-label { min-width: 0; }
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
.entry-actions { justify-content: flex-end; gap: 4px; }
.command-row > .entry-actions { max-width: 64%; }
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
.appearance-preview { display: flex; align-items: center; gap: 10px; }
.appearance-preview .preview-ball { width: 40px; height: 40px; cursor: default; }
.editor .color-setting { grid-template-columns: 1fr auto; align-items: center; }
.editor .color-setting small, .editor output { color: var(--bs-secondary-color, inherit); }
.editor input[type="color"] { width: 44px; height: 32px; }
.editor input[type="range"] { width: 100%; }
.editor .reset-appearance { margin-right: auto; }
`
