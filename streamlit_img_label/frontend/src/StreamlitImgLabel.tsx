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
    const [canvas, setCanvas] = useState(new fabric.Canvas(""))
    const { canvasWidth, canvasHeight, imageData }: PythonArgs = props.args
    const [newBBoxIndex, setNewBBoxIndex] = useState<number>(0)

    /*
     * Translate Python image data to a JavaScript Image
     */
    var invisCanvas = document.createElement("canvas")
    var ctx = invisCanvas.getContext("2d")

    invisCanvas.width = canvasWidth
    invisCanvas.height = canvasHeight

    // create imageData object
    let dataUri: any
    if (ctx) {
        var idata = ctx.createImageData(canvasWidth, canvasHeight)

        // set our buffer as source
        idata.data.set(imageData)

        // update canvas with new data
        ctx.putImageData(idata, 0, 0)
        dataUri = invisCanvas.toDataURL()
    } else {
        dataUri = ""
    }

    // Initialize canvas on mount and add a rectangle
    useEffect(() => {
        const { rects, boxColor }: PythonArgs = props.args
        const canvasTmp = new fabric.Canvas("c", {
            enableRetinaScaling: false,
            backgroundImage: dataUri,
            uniScaleTransform: true,
        })

        rects.forEach((rect) => {
            const { top, left, width, height } = rect
            canvasTmp.add(
                new fabric.Rect({
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
            )
        })
        setLabels(rects.map((rect) => rect.label))

        setCanvas(canvasTmp)
        Streamlit.setFrameHeight()
        // eslint-disable-next-line
    }, [canvasHeight, canvasWidth, dataUri])

    // Create defualt bounding box
    const defaultBox = () => ({
        left: canvasWidth * 0.15 + newBBoxIndex * 3,
        top: canvasHeight * 0.15 + newBBoxIndex * 3,
        width: canvasWidth * 0.2,
        height: canvasHeight * 0.2,
    })

    // Add new bounding box to be image
    const addBoxHandler = () => {
        const box = defaultBox()
        setNewBBoxIndex(newBBoxIndex + 1)
        canvas.add(
            new fabric.Rect({
                ...box,
                fill: "",
                objectCaching: true,
                stroke: props.args.boxColor,
                strokeWidth: 1,
                strokeUniform: true,
                hasRotatingPoint: false,
            })
        )
        sendCoordinates([...labels, ""])
    }

    // Remove the selected bounding box
    const removeBoxHandler = () => {
        const selectedObjects = canvas.getActiveObjects();
        const selectedIndices = selectedObjects.map(obj => canvas.getObjects().indexOf(obj));
        selectedObjects.forEach(obj => canvas.remove(obj));
        const updatedLabels = labels.filter((label, index) => !selectedIndices.includes(index));
        sendCoordinates(updatedLabels);
        canvas.discardActiveObject().renderAll();
    };

    // Reset the bounding boxes
    const resetHandler = () => {
        clearHandler()
        const { rects, boxColor }: PythonArgs = props.args
        rects.forEach((rect) => {
            const { top, left, width, height } = rect
            canvas.add(
                new fabric.Rect({
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
            )
        })
        sendCoordinates(labels)
    }

    const clearHandler = () => {
        setNewBBoxIndex(0)
        canvas.getObjects().forEach((rect) => canvas.remove(rect))
        sendCoordinates([])
    }

    const sendCoordinates = (returnLabels: string[]) => {
        setLabels(returnLabels)
        const rects = canvas.getObjects().map((rect, i) => ({
            ...rect.getBoundingRect(),
            label: returnLabels[i],
        }))
        Streamlit.setComponentValue({ rects })
    }

    useEffect(() => {
        if (!canvas) return
        const handleEvent = () => {
            canvas.renderAll()
            sendCoordinates(labels)
        }
        canvas.on("object:modified", handleEvent)
        return () => {
            canvas.off("object:modified")
        }
    })

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

    // Keyboard shortcuts
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
        </>
    )
}

export default withStreamlitConnection(StreamlitImgLabel)
