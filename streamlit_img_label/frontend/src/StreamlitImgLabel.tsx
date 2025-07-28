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
  /* ---------- state ---------- */
  const { canvasWidth, canvasHeight, imageData }: PythonArgs = props.args

  const [mode, setMode]               = useState<"light" | "dark">("light")
  const [labels, setLabels]           = useState<string[]>([])
  const [canvas, setCanvas]           = useState(new fabric.Canvas(""))
  const [newBBoxIndex, setNewBBoxIndex] = useState(0)
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null)

  /* ---------- convert raw RGBA to data‑uri ---------- */
  const invis = document.createElement("canvas")
  invis.width  = canvasWidth
  invis.height = canvasHeight
  let dataUri = ""
  const ctx = invis.getContext("2d")
  if (ctx) {
    const id = ctx.createImageData(canvasWidth, canvasHeight)
    id.data.set(imageData)
    ctx.putImageData(id, 0, 0)
    dataUri = invis.toDataURL()
  }

  /* ---------- build / rebuild canvas ---------- */
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
        }),
      ),
    )

    setLabels(rects.map(r => r.label))
    setCanvas(c)
    Streamlit.setFrameHeight()

    return () => { c.dispose() }               // clean up on unmount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasWidth, canvasHeight, dataUri])

  /* ---------- helpers ---------- */
  const defaultBox = () => ({
    left:   canvasWidth  * 0.15 + newBBoxIndex * 3,
    top:    canvasHeight * 0.15 + newBBoxIndex * 3,
    width:  canvasWidth  * 0.20,
    height: canvasHeight * 0.20,
  })

  const sendCoordinates = (updatedLabels = labels) => {
    const rects = canvas.getObjects().map((rect, i) => ({
      ...rect.getBoundingRect(),
      label: updatedLabels[i] ?? "",
    }))
    Streamlit.setComponentValue({ rects })
  }

  /* ---------- CRUD for boxes ---------- */
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
      }),
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
    setSelectedIdx(null)
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
        }),
      ),
    )
    setLabels(rects.map(r => r.label))
    sendCoordinates(rects.map(r => r.label))
    setSelectedIdx(null)
  }

  const clearAll = () => {
    setNewBBoxIndex(0)
    canvas.getObjects().forEach(o => canvas.remove(o))
    setLabels([])
    sendCoordinates([])
    setSelectedIdx(null)
  }

  /* ---------- selection & label editing ---------- */
  useEffect(() => {
    if (!canvas) return

    const updateSel = () => {
      const active = canvas.getActiveObjects()[0]
      if (active) {
        const idx = canvas.getObjects().indexOf(active)
        setSelectedIdx(idx)

        // highlight active shape
        active.set({ strokeWidth: 2 })
      }
      canvas.getObjects().forEach(obj => {
        if (obj !== canvas.getActiveObjects()[0]) obj.set({ strokeWidth: 1 })
      })
      canvas.renderAll()
    }

    canvas.on("selection:created", updateSel)
    canvas.on("selection:updated", updateSel)
    canvas.on("selection:cleared", () => setSelectedIdx(null))

    // keep XML coords in‑sync when boxes move/resize
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
    if (selectedIdx === null) return
    const updated = labels.slice()
    updated[selectedIdx] = e.target.value
    setLabels(updated)
    sendCoordinates(updated)
  }

  /* ---------- keyboard shortcuts ---------- */
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      switch (e.key.toLowerCase()) {
        case "a": addBox();         break
        case "r": removeSelected(); break
        case "x": resetBoxes();     break
        case "c": clearAll();       break
      }
    }
    window.addEventListener("keydown", down)
    return () => window.removeEventListener("keydown", down)
  })

  /* ---------- dark / light ---------- */
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)")
    const listener = (e: MediaQueryListEvent) =>
      setMode(e.matches ? "dark" : "light")
    media.addEventListener("change", listener)
    setMode(media.matches ? "dark" : "light")
    return () => media.removeEventListener("change", listener)
  }, [])

  const darkClass = mode === "dark" ? styles.dark : ""

  /* ---------- render ---------- */
  return (
    <>
      <canvas
        id="c"
        className={darkClass}
        width={canvasWidth}
        height={canvasHeight}
      />

      <div className={darkClass} style={{ marginTop: "0.5rem" }}>
        <button onClick={addBox}>Add bounding box (A)</button>
        <button onClick={removeSelected}>Remove selected (R)</button>
        <button onClick={resetBoxes}>Reset (X)</button>
        <button onClick={clearAll}>Clear all (C)</button>

        {selectedIdx !== null && (
          <input
            style={{ marginLeft: "0.75rem" }}
            placeholder="Label for selected box"
            value={labels[selectedIdx] ?? ""}
            onChange={handleLabelChange}
            autoFocus
          />
        )}
      </div>
    </>
  )
}

export default withStreamlitConnection(StreamlitImgLabel)