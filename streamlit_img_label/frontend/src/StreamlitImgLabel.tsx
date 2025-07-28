import React, { useEffect, useState } from "react"
import {
    ComponentProps,
    Streamlit,
    withStreamlitConnection,
} from "streamlit-component-lib"
import { fabric } from "fabric"
import styles from "./StreamlitImgLabel.module.css"

interface RectProps {
    top: number
    left: number
    width: number
    height: number
    label: string
}

interface PythonArgs {
    canvasWidth: number
    canvasHeight: number
    rects: RectProps[]
    boxColor: string
    imageData: Uint8ClampedArray
}

const StreamlitImgLabel = (props: ComponentProps) => {
    const [mode, setMode] = useState<string>("light")
    const [labels, setLabels] = useState<string[]>([])
    const [canvas, setCanvas] = useState<fabric.Canvas | null>(null)
    const [newBBoxIndex, setNewBBoxIndex] = useState<number>(0)
    const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
    const [labelInput, setLabelInput] = useState<string>("")

    const { canvasWidth, canvasHeight, imageData }: PythonArgs = props.args

    // Generate base64 image data URI
    const invisCanvas = document.createElement("canvas")
    const ctx = invisCanvas.getContext("2d")
    invisCanvas.width = canvasWidth
    invisCanvas.height = canvasHeight

    let dataUri: any
    if (ctx) {
        const idata = ctx.createImageData(canvasWidth, canvasHeight)
        idata.data.set(imageData)
        ctx.putImageData(idata, 0, 0)
        dataUri = invisCanvas.toDataURL()
    } else {
        dataUri = ""
    }

    // Initialize canvas and load boxes
    useEffect(() => {
        const { rects, boxColor }: PythonArgs = props.args
        const canvasTmp = new fabric.Canvas("c", {
            enableRetinaScaling: false,
            backgroundImage: dataUri,
            uniScaleTransform: true,
        })

        rects.forEach((rect) => {
            const { top, left, width, height, label } = rect
            const box = new fabric.Rect({
                left,
                top,
                fill: "",
                width,
                height,
                objectCaching: true,
                stroke: boxColor,
                strokeWidth: 1,
                strokeUniform: true,
                hasRotatingPoint: false,
            })

            const text = new fabric.Text(label, {
                left,
                top: top - 20,
                fontSize: 14,
                fill: boxColor,
                selectable: false,
                evented: false,
            })

            const group = new fabric.Group([box, text], {
                selectable: true,
                hasControls: true,
            })

            canvasTmp.add(group)
        })

        setLabels(rects.map((rect) => rect.label))
        setCanvas(canvasTmp)
        Streamlit.setFrameHeight()
    }, [canvasHeight, canvasWidth, dataUri])

    const defaultBox = () => ({
        left: canvasWidth * 0.15 + newBBoxIndex * 3,
        top: canvasHeight * 0.15 + newBBoxIndex * 3,
        width: canvasWidth * 0.2,
        height: canvasHeight * 0.2,
    })

    const addBoxHandler = () => {
        if (!canvas) return
        const box = defaultBox()
        setNewBBoxIndex(newBBoxIndex + 1)

        const rect = new fabric.Rect({
            ...box,
            fill: "",
            objectCaching: true,
            stroke: props.args.boxColor,
            strokeWidth: 1,
            strokeUniform: true,
            hasRotatingPoint: false,
        })

        const text = new fabric.Text("", {
            left: box.left,
            top: box.top - 20,
            fontSize: 14,
            fill: props.args.boxColor,
            selectable: false,
            evented: false,
        })

        const group = new fabric.Group([rect, text], {
            selectable: true,
            hasControls: true,
        })

        canvas.add(group)
        sendCoordinates([...labels, ""])
    }

    const removeBoxHandler = () => {
        if (!canvas) return
        const selectedObjects = canvas.getActiveObjects()
        const selectedIndices = selectedObjects.map(obj =>
            canvas.getObjects().indexOf(obj)
        )
        selectedObjects.forEach(obj => canvas.remove(obj))
        const updatedLabels = labels.filter((_, index) => !selectedIndices.includes(index))
        sendCoordinates(updatedLabels)
        setSelectedIndex(null)
        canvas.discardActiveObject().renderAll()
    }

    const resetHandler = () => {
        if (!canvas) return
        clearHandler()
        const { rects, boxColor }: PythonArgs = props.args
        rects.forEach((rect) => {
            const { top, left, width, height, label } = rect
            const box = new fabric.Rect({
                left,
                top,
                fill: "",
                width,
                height,
                objectCaching: true,
                stroke: boxColor,
                strokeWidth: 1,
                strokeUniform: true,
                hasRotatingPoint: false,
            })

            const text = new fabric.Text(label, {
                left,
                top: top - 20,
                fontSize: 14,
                fill: boxColor,
                selectable: false,
                evented: false,
            })

            const group = new fabric.Group([box, text], {
                selectable: true,
                hasControls: true,
            })

            canvas.add(group)
        })
        sendCoordinates(labels)
    }

    const clearHandler = () => {
        if (!canvas) return
        setNewBBoxIndex(0)
        canvas.getObjects().forEach(obj => canvas.remove(obj))
        setSelectedIndex(null)
        sendCoordinates([])
    }

    const sendCoordinates = (returnLabels: string[]) => {
        if (!canvas) return
        setLabels(returnLabels)
        const rects = canvas.getObjects().map((group, i) => {
            const objects = (group as fabric.Group)._objects
            const rect = objects[0] as fabric.Rect
            return {
                ...rect.getBoundingRect(),
                label: returnLabels[i],
            }
        })
        Streamlit.setComponentValue({ rects })
    }

    useEffect(() => {
        if (!canvas) return

        const handleModified = () => {
            canvas.renderAll()
            sendCoordinates(labels)
        }

        const handleSelected = (e: fabric.IEvent) => {
            const selectedObjects = (e as any).selected
            const selected = selectedObjects?.[0]
            if (selected) {
                const index = canvas.getObjects().indexOf(selected)
                setSelectedIndex(index)
                setLabelInput(labels[index] || "")
            } else {
                setSelectedIndex(null)
            }
        }

        canvas.on("object:modified", handleModified)
        canvas.on("selection:created", handleSelected)
        canvas.on("selection:updated", handleSelected)
        canvas.on("selection:cleared", () => {
            setSelectedIndex(null)
        })

        return () => {
            canvas.off("object:modified", handleModified)
            canvas.off("selection:created", handleSelected)
            canvas.off("selection:updated", handleSelected)
            canvas.off("selection:cleared")
        }
    }, [canvas, labels])

    const onSelectMode = (mode: string) => {
        setMode(mode)
        if (mode === "dark") document.body.classList.add("dark-mode")
        else document.body.classList.remove("dark-mode")
    }

    useEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: dark)")
        const listener = (e: MediaQueryListEvent) =>
            onSelectMode(e.matches ? "dark" : "light")
        media.addEventListener("change", listener)
        onSelectMode(media.matches ? "dark" : "light")
        return () => media.removeEventListener("change", listener)
    }, [])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const key = e.key.toLowerCase()
            if (key === "a") addBoxHandler()
            else if (key === "r") removeBoxHandler()
            else if (key === "x") resetHandler()
            else if (key === "c") clearHandler()
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [canvas, labels])

    const darkClass = mode === "dark" ? styles.dark : ""

    return (
        <>
            <canvas
                id="c"
                className={darkClass}
                width={canvasWidth}
                height={canvasHeight}
            />
            <div className={darkClass}>
                <button className={darkClass} onClick={addBoxHandler}>
                    Add bounding box (A)
                </button>
                <button className={darkClass} onClick={removeBoxHandler}>
                    Remove selected (R)
                </button>
                <button className={darkClass} onClick={resetHandler}>
                    Reset (X)
                </button>
                <button className={darkClass} onClick={clearHandler}>
                    Clear all (C)
                </button>
            </div>

            {selectedIndex !== null && (
                <div className={darkClass}>
                    <label>Label for selected box:</label>
                    <input
                        type="text"
                        value={labelInput}
                        onChange={(e) => setLabelInput(e.target.value)}
                        onBlur={() => {
                            if (!canvas || selectedIndex === null) return
                            const updatedLabels = [...labels]
                            updatedLabels[selectedIndex] = labelInput

                            const group = canvas.getObjects()[selectedIndex] as fabric.Group
                            const text = group.item(1) as fabric.Text
                            text.set("text", labelInput)

                            canvas.renderAll()
                            sendCoordinates(updatedLabels)
                        }}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && selectedIndex !== null && canvas) {
                                const updatedLabels = [...labels]
                                updatedLabels[selectedIndex] = labelInput

                                const group = canvas.getObjects()[selectedIndex] as fabric.Group
                                const text = group.item(1) as fabric.Text
                                text.set("text", labelInput)

                                canvas.renderAll()
                                sendCoordinates(updatedLabels)
                            }
                        }}
                    />
                </div>
            )}
        </>
    )
}

export default withStreamlitConnection(StreamlitImgLabel)