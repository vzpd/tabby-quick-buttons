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

const ballSize = 52
const edge = 8
const positionKey = 'tabby-quick-buttons.floating-position'

export class FloatingButton {
    movingBall = false
    private ballPosition = this.loadBallPosition()
    private ballDrag: BallDrag | null = null
    private viewport = { width: window.innerWidth, height: window.innerHeight }

    constructor (
        private readonly onMoveEnd: () => void,
        private readonly onSaveError: () => void,
    ) {}

    get dragging (): boolean {
        return this.ballDrag !== null
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

    startDrag (event: PointerEvent): void {
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
        this.onMoveEnd()
        try {
            window.localStorage.setItem(positionKey, JSON.stringify(this.ballPosition))
        } catch {
            this.onSaveError()
        }
    }

    cancelDrag (): void {
        if (this.ballDrag) {
            this.releaseBallDrag(this.ballDrag)
        }
        this.movingBall = false
    }

    private releaseBallDrag (drag: BallDrag): void {
        this.ballDrag = null
        drag.removeListeners()
        if (drag.handle.hasPointerCapture(drag.pointerId)) {
            drag.handle.releasePointerCapture(drag.pointerId)
        }
    }
}
