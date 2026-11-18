import { DOCUMENT, CommonModule } from '@angular/common'
import { APP_BOOTSTRAP_LISTENER, ApplicationRef, ComponentRef, EnvironmentInjector, Injectable, NgModule, createComponent } from '@angular/core'
import { ConfigProvider, ToolbarButton, ToolbarButtonProvider } from 'tabby-core'
import { Subject } from 'rxjs'
import { QuickButtonsComponent, QuickButtonsConfig } from './quickButtons.component'

class QuickButtonsConfigProvider extends ConfigProvider {
    override defaults: { quickButtons: QuickButtonsConfig } = {
        quickButtons: { scopes: [] },
    }
}

@Injectable()
class QuickButtonsToolbar extends ToolbarButtonProvider {
    readonly opened = new Subject<void>()

    provide (): ToolbarButton[] {
        return [{
            title: 'Quick Buttons',
            icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m4 7 5 5-5 5m8 0h7"/></svg>',
            click: () => this.opened.next(),
        }]
    }
}

function mountQuickButtons (
    app: ApplicationRef,
    injector: EnvironmentInjector,
    document: Document,
    toolbar: QuickButtonsToolbar,
): () => void {
    let component: ComponentRef<QuickButtonsComponent> | undefined
    return () => {
        if (component) {
            return
        }
        const host = document.createElement('tabby-quick-buttons')
        document.body.append(host)
        component = createComponent(QuickButtonsComponent, { environmentInjector: injector, hostElement: host })
        app.attachView(component.hostView)
        const instance = component.instance
        const launch = toolbar.opened.subscribe(() => instance.togglePinned())
        component.onDestroy(() => {
            launch.unsubscribe()
            host.remove()
        })
    }
}

@NgModule({
    imports: [CommonModule],
    declarations: [QuickButtonsComponent],
    providers: [
        { provide: ConfigProvider, useClass: QuickButtonsConfigProvider, multi: true },
        QuickButtonsToolbar,
        { provide: ToolbarButtonProvider, useExisting: QuickButtonsToolbar, multi: true },
        {
            provide: APP_BOOTSTRAP_LISTENER,
            useFactory: mountQuickButtons,
            deps: [ApplicationRef, EnvironmentInjector, DOCUMENT, QuickButtonsToolbar],
            multi: true,
        },
    ],
})
export default class QuickButtonsPlugin {}
