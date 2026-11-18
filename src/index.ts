import { DOCUMENT, CommonModule } from '@angular/common'
import { APP_BOOTSTRAP_LISTENER, ApplicationRef, ComponentRef, EnvironmentInjector, NgModule, createComponent } from '@angular/core'
import { ConfigProvider } from 'tabby-core'
import { QuickButtonsComponent, QuickButtonsConfig } from './quickButtons.component'

class QuickButtonsConfigProvider extends ConfigProvider {
    override defaults: { quickButtons: QuickButtonsConfig } = {
        quickButtons: { scopes: [] },
    }
}

function mountQuickButtons (
    app: ApplicationRef,
    injector: EnvironmentInjector,
    document: Document,
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
        component.onDestroy(() => host.remove())
    }
}

@NgModule({
    imports: [CommonModule],
    declarations: [QuickButtonsComponent],
    providers: [
        { provide: ConfigProvider, useClass: QuickButtonsConfigProvider, multi: true },
        {
            provide: APP_BOOTSTRAP_LISTENER,
            useFactory: mountQuickButtons,
            deps: [ApplicationRef, EnvironmentInjector, DOCUMENT],
            multi: true,
        },
    ],
})
export default class QuickButtonsPlugin {}
