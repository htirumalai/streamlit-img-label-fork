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
  const { canvasWidth, canvasHeight, imageData }: PythonArgs = props.args

  const [mode, setMode] = useState<"light" | "dark">("light")
  const [labels, setLabels] = useState<string[]>([])
  const [canvas, setCanvas] = useState(new fabric.Canvas(""))
  const [newBBoxIndex, setNewBBoxIndex] = useState(0)
  const [selectedIndices, setSelectedIndices] = useState<number[]>([])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const invis = document.createElement("canvas")
  invis.width = canvasWidth
  invis.height = canvasHeight
  let dataUri = ""
  const ctx = invis.getContext("2d")
  if (ctx) {
    const id = ctx.createImageData(canvasWidth, canvasHeight)
    id.data.set(imageData)
    ctx.putImageData(id, 0, 0)
    dataUri = invis.toDataURL()
  }

  useEffect(() => {
    const { rects, boxColor }: PythonArgs = props.args
    const c = new fabric.Canvas("c", {
      enableRetinaScaling: false,
      backgroundImage: dataUri,
      uniScaleTransform: true,
      selection: true,
    })

    rects.forEach(({ top, left, width, height }) =>
      c.add(
        new fabric.Rect({
          left,
          top,
          width,
          height,
          fill: "",
          stroke: boxColor,
          strokeWidth: 1,
          strokeUniform: true,
          objectCaching: true,
          hasRotatingPoint: false,
        })
      )
    )

    setLabels(rects.map(r => r.label))
    setCanvas(c)
    Streamlit.setFrameHeight()

    return () => {
      c.dispose()
    }
  }, [canvasWidth, canvasHeight, dataUri])

  const defaultBox = () => ({
    left: canvasWidth * 0.15 + newBBoxIndex * 3,
    top: canvasHeight * 0.15 + newBBoxIndex * 3,
    width: canvasWidth * 0.2,
    height: canvasHeight * 0.2,
  })

  const sendCoordinates = (updatedLabels = labels) => {
    const rects = canvas.getObjects().map((rect, i) => ({
      ...rect.getBoundingRect(),
      label: updatedLabels[i] ?? "",
    }))
    Streamlit.setComponentValue({ rects })
  }

  const addBox = () => {
    const box = defaultBox()
    setNewBBoxIndex(n => n + 1)
    canvas.add(
      new fabric.Rect({
        ...box,
        fill: "",
        stroke: props.args.boxColor,
        strokeWidth: 1,
        strokeUniform: true,
        objectCaching: true,
        hasRotatingPoint: false,
      })
    )
    const updated = [...labels, ""]
    setLabels(updated)
    sendCoordinates(updated)
  }

  const removeSelected = () => {
    const sel = canvas.getActiveObjects()
    if (!sel.length) return
    const indices = sel.map(obj => canvas.getObjects().indexOf(obj))
    sel.forEach(obj => canvas.remove(obj))
    canvas.discardActiveObject().renderAll()

    const updated = labels.filter((_, i) => !indices.includes(i))
    setLabels(updated)
    sendCoordinates(updated)
    setSelectedIndices([])
  }

  const resetBoxes = () => {
    setNewBBoxIndex(0)
    const { rects, boxColor } = props.args as PythonArgs
    canvas.clear()
    canvas.setBackgroundImage(dataUri, canvas.renderAll.bind(canvas))
    rects.forEach(({ top, left, width, height }) =>
      canvas.add(
        new fabric.Rect({
          left,
          top,
          width,
          height,
          fill: "",
          stroke: boxColor,
          strokeWidth: 1,
          strokeUniform: true,
          objectCaching: true,
          hasRotatingPoint: false,
        })
      )
    )
    setLabels(rects.map(r => r.label))
    sendCoordinates(rects.map(r => r.label))
    setSelectedIndices([])
  }

  const clearAll = () => {
    setNewBBoxIndex(0)
    canvas.getObjects().forEach(o => canvas.remove(o))
    setLabels([])
    sendCoordinates([])
    setSelectedIndices([])
  }

  let isDrawing = false
  let rect: fabric.Rect | null = null
  let origX = 0
  let origY = 0

  const startDraw = (o: fabric.IEvent) => {
    if (canvas) {
      isDrawing = true
      const pointer = canvas.getPointer(o.e as MouseEvent)
      origX = pointer.x
      origY = pointer.y

      rect = new fabric.Rect({
        left: origX,
        top: origY,
        fill: "",
        stroke: props.args.boxColor,
        strokeWidth: 1,
        strokeUniform: true,
        hasRotatingPoint: false,
        objectCaching: true,
        selectable: true,
      })

      canvas.add(rect)
      canvas.renderAll()
    }
  }

  const continueDraw = (o: fabric.IEvent) => {
    if (canvas && isDrawing && rect) {
      const pointer = canvas.getPointer(o.e as MouseEvent)

      if (origX > pointer.x) rect.set({ left: Math.round(pointer.x) })
      if (origY > pointer.y) rect.set({ top: Math.round(pointer.y) })

      rect.set({
        width: Math.round(Math.abs(origX - pointer.x)),
        height: Math.round(Math.abs(origY - pointer.y)),
      })

      canvas.renderAll()
    }
  }

  const endDraw = () => {
    if (canvas && rect) {
      isDrawing = false
      setNewBBoxIndex(newBBoxIndex + 1)
      rect.setCoords()
      canvas.setActiveObject(rect)
      sendCoordinates([...labels, ""])
      canvas.off("mouse:down", startDraw)
      canvas.off("mouse:move", continueDraw)
      canvas.off("mouse:up", endDraw)
      setEditingIndex(canvas.getObjects().length - 1)
    }
  }

  const addCustomBoxHandler = () => {
    if (canvas) {
      canvas.on("mouse:down", startDraw)
      canvas.on("mouse:move", continueDraw)
      canvas.on("mouse:up", endDraw)
    }
  }

  useEffect(() => {
    if (!canvas) return

    const updateSel = () => {
      const activeObjs = canvas.getActiveObjects()
      const indices = activeObjs.map(obj => canvas.getObjects().indexOf(obj))
      setSelectedIndices(indices)

      canvas.getObjects().forEach(obj => {
        const index = canvas.getObjects().indexOf(obj)
        obj.set({ strokeWidth: indices.includes(index) ? 2 : 1 })
      })
      canvas.renderAll()
    }

    canvas.on("selection:created", updateSel)
    canvas.on("selection:updated", updateSel)
    canvas.on("selection:cleared", () => setSelectedIndices([]))

    const onChange = () => sendCoordinates()
    canvas.on("object:modified", onChange)

    return () => {
      canvas.off("selection:created", updateSel)
      canvas.off("selection:updated", updateSel)
      canvas.off("selection:cleared")
      canvas.off("object:modified", onChange)
    }
  }, [canvas, labels])

  const handleLabelChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (selectedIndices.length === 0) return
    const updated = labels.slice()
    selectedIndices.forEach(i => {
      updated[i] = e.target.value
    })
    setLabels(updated)
    sendCoordinates(updated)
  }

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case "1": addBox(); break
        case "2": addCustomBoxHandler(); break
        case "3": removeSelected(); break
        case "4": resetBoxes(); break
        case "5": clearAll(); break
      }
    }
    window.addEventListener("keydown", down)
    return () => window.removeEventListener("keydown", down)
  })

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const listener = (e: MediaQueryListEvent) =>
      setMode(e.matches ? "dark" : "light")
    media.addEventListener("change", listener)
    setMode(media.matches ? "dark" : "light")
    return () => media.removeEventListener("change", listener)
  }, [])

  const darkClass = mode === "dark" ? styles.dark : ""

  return (
    <>
      <canvas
        id="c"
        className={darkClass}
        width={canvasWidth}
        height={canvasHeight}
      />

      <div className={darkClass} style={{ marginTop: "0.5rem" }}>
        <button onClick={addBox}>Add bounding box (1)</button>
        <button onClick={addCustomBoxHandler}>Add custom bounding box (2)</button>
        <button onClick={removeSelected}>Remove selected (3)</button>
        <button onClick={resetBoxes}>Reset (4)</button>
        <button onClick={clearAll}>Clear all (5)</button>

        {selectedIndices.length > 0 && (
          <input
            style={{ marginLeft: "0.75rem" }}
            placeholder="Label for selected box(es)"
            value={labels[selectedIndices[0]] ?? ""}
            onChange={handleLabelChange}
            autoFocus
          />
        )}
      </div>
    </>
  )
}

export default withStreamlitConnection(StreamlitImgLabel)