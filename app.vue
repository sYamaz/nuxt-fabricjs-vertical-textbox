<template>
  <div id="canvas-container" style="width:100%; height: 100%" />
</template>
<script setup lang="ts">
import { fabric } from 'fabric'
import {VerticalText} from './VerticalTextBox/shapes/Text/VerticalText'

onMounted(() => {
  const div = document.getElementById('canvas-container') as HTMLDivElement
  const _canvas = document.createElement('canvas')
  _canvas.width = 500
  _canvas.height = 500
  div.appendChild(_canvas)
  
  const canvas = new fabric.Canvas(_canvas)

  // const t = new fabric.Text("Text aaaaaaaaaaaaaaa", {fill: 'black', top:75, width: 50})
  // const it = new fabric.IText("IText aaaaaaaaaaaaaaa", {fill: 'black', top:100, width: 50 })
  // const tb = new fabric.Textbox("Textbox aaaaaaaaaaaaaaa", {fill: 'black', top:50, width: 50})

  const vt = new VerticalText("縦書きテキスト\n二行目\n三行目", {fill: 'black', top:75, width: 50, charSpacing: 50})

  canvas.add(vt)
})
</script>