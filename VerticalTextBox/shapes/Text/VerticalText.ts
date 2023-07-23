import { fabric } from 'fabric'
import { LEFT, RIGHT } from '../../constants';
import { hasStyleChanged } from '../../util/misc/textStyles';
import { StylePropertiesType } from './constants';
import { cache } from '../../cache';
import { createCanvasElement } from '../../util/misc/dom';

const JUSTIFY = "justify"
/**
 * Measure and return the info of a single grapheme.
 * needs the the info of previous graphemes already filled
 * Override to customize measuring
 */
export type GraphemeBBox = {
    width: number;
    height: number;
    kernedWidth: number;
    left: number;
    deltaY: number;
    renderLeft?: number;
    renderTop?: number;
    angle?: number;
}

let measuringContext: CanvasRenderingContext2D | null;

/**
 * Return a context for measurement of text string.
 * if created it gets stored for reuse
 */
function getMeasuringContext() {
    if (!measuringContext) {
        measuringContext = createCanvasElement().getContext('2d');
    }
    return measuringContext;
}

export type CompleteTextStyleDeclaration = Pick<VerticalText, StylePropertiesType>;

export type TextStyleDeclaration = Partial<CompleteTextStyleDeclaration>;

export class VerticalText extends fabric.Text {

    declare _reNewline: RegExp
    declare _reWords: RegExp
    declare offsets: {
        underline: number
        linethrough: number
        overline: number
    }
    declare MIN_TEXT_WIDTH: number
    declare MIN_TEXT_HEIGHT: number

    static genericFonts = [
        'sans-serif',
        'serif',
        'cursive',
        'fantasy',
        'monospace',
    ];
    static type = 'VerticalText'

    cursorHeight: number = 10

    constructor(text: string, options?: fabric.ITextOptions) {
        super(text, options)
    }

    // // overrides
    // setPathInfo() {
    //     // @ts-ignore
    //     super.setPathInfo()
    // }

    // _splitText() {
    //   const newLines = this._splitTextIntoLines(this.text);
    //   this.textLines = newLines.lines;
    //   this._textLines = newLines.graphemeLines;
    //   this._unwrappedTextLines = newLines._unwrappedLines;
    //   this._text = newLines.graphemeText;
    //   return newLines;
    // }



    // override
    initDimensions(): void {
        this._splitText()
        this._clearCache()
        this.dirty = true

        // パス機能は省く
        this.width = this.calcTextWidth()
        const height = this.calcTextHeight()
        this.height = height || this.cursorHeight || this.MIN_TEXT_HEIGHT

        console.log({height, thisHeight:this.height, thisText: this.text})
        const align = this.textAlign
        if (align) {
            if (align.includes(JUSTIFY)) {
                this.enlargeSpaces()
            }
        }
    }

    enlargeSpaces(): void {
        let diffSpace,
            currentLineWidth,
            numberOfSpaces,
            accumulatedSpace,
            line,
            charBound,
            spaces;
        for (let i = 0, len = this._textLines.length; i < len; i++) {
            if (
                this.textAlign !== JUSTIFY &&
                (i === len - 1 || this.isEndOfWrapping(i))
            ) {
                continue;
            }
            accumulatedSpace = 0;
            line = this._textLines[i];
            currentLineWidth = this.getLineHeight(i);
            if (
                currentLineWidth < this.width! &&
                (spaces = this.textLines[i].match(this._reSpacesAndTabs))
            ) {
                numberOfSpaces = spaces.length;
                diffSpace = (this.width! - currentLineWidth) / numberOfSpaces;
                for (let j = 0; j <= line.length; j++) {
                    // @ts-ignore
                    charBound = this.__charBounds[i][j];
                    if (this._reSpaceAndTab.test(line[j])) {
                        charBound.width += diffSpace;
                        // @ts-ignore
                        charBound.kernedWidth += diffSpace;
                        charBound.left += accumulatedSpace;
                        accumulatedSpace += diffSpace;
                    } else {
                        charBound.left += accumulatedSpace;
                    }
                }
            }
        }
    }

    getWidthOfChar(line: number, _char: number): number {
        return this.getValueOfPropertyAt(line, _char, 'fontSize')
    }

    getWidthOfLine(lineIndex: number): number {
        if (this.__lineWidths[lineIndex]) {
            return this.__lineWidths[lineIndex]
        }

        let maxWidth: number = this.getWidthOfChar(lineIndex, 0)
        for (let i = 1, len = this._textLines[lineIndex].length; i < len; i++) {
            maxWidth = Math.max(this.getWidthOfChar(lineIndex, i), maxWidth)
        }

        const ret = maxWidth * this.lineHeight! * this._fontSizeMult
        this.__lineWidths[lineIndex] = ret
        return ret
    }

    /**
     * 
     * @returns {Number} Maximum height of Text object
     */
    calcTextWidth(): number {
        let lineWidth, width = 0
        for (let i = 0, len = this._textLines.length; i < len; i++) {
            lineWidth = this.getWidthOfLine(i)
            // @ts-ignore
            width += i === len - 1 ? lineWidth / this.lineHeight : this.lineHeight
        }
        return width
    }

    /**
   * @private
   * @param {String} method Method name ("fillText" or "strokeText")
   * @param {CanvasRenderingContext2D} ctx Context to render on
   * @param {String} line Text to render
   * @param {Number} left Left position of text
   * @param {Number} top Top position of text
   * @param {Number} lineIndex Index of a line in a text
   */
  _renderVTextLine(
    method: 'fillText' | 'strokeText',
    ctx: CanvasRenderingContext2D,
    line: string[],
    left: number,
    top: number,
    lineIndex: number
  ) {
    this._renderChars(method, ctx, line.join(''), left, top, lineIndex);
  }

    /**
   * measure and return the width of a single character.
   * possibly overridden to accommodate different measure logic or
   * to hook some external lib for character measurement
   * @private
   * @param {String} _char, char to be measured
   * @param {Object} charStyle style of char to be measured
   * @param {String} [previousChar] previous char
   * @param {Object} [prevCharStyle] style of previous char
   */
    _measureChar(
        _char: string,
        charStyle: CompleteTextStyleDeclaration,
        previousChar: string | undefined,
        prevCharStyle: CompleteTextStyleDeclaration | Record<string, never>
    ) {
        const fontCache = cache.getFontCache({
            fontFamily: charStyle.fontFamily!,
            fontStyle: charStyle.fontStyle!,
            fontWeight: charStyle.fontWeight!
        }),
            fontDeclaration = this._getFontDeclaration(charStyle),
            couple = previousChar + _char,
            stylesAreEqual =
                previousChar &&
                fontDeclaration === this._getFontDeclaration(prevCharStyle),
            // @ts-ignore
            fontMultiplier = charStyle.fontSize / this.CACHE_FONT_SIZE;
        let width: number | undefined,
            height: number | undefined,
            coupleWidth: number | undefined,
            previousWidth: number | undefined,
            kernedWidth: number | undefined;


        if (previousChar && fontCache[previousChar] !== undefined) {
            previousWidth = fontCache[previousChar];
        }
        if (fontCache[_char] !== undefined) {
            kernedWidth = width = fontCache[_char];
        }
        if (stylesAreEqual && fontCache[couple] !== undefined) {
            coupleWidth = fontCache[couple];
            kernedWidth = coupleWidth - previousWidth!;
        }
        if (
            width === undefined ||
            previousWidth === undefined ||
            coupleWidth === undefined ||
            height === undefined
        ) {
            const ctx = getMeasuringContext()!;
            // send a TRUE to specify measuring font size CACHE_FONT_SIZE
            // @ts-ignore
            this._setTextStyles(ctx, charStyle, true);
            if (width === undefined || height === undefined) {
                const m = ctx.measureText(_char)
                kernedWidth = width = m.width;
                height = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent
                // @ts-ignore
                fontCache[_char] = width;
            }
            if (previousWidth === undefined && stylesAreEqual && previousChar) {
                const m = ctx.measureText(previousChar)
                previousWidth = m.width;
                // @ts-ignore
                fontCache[previousChar] = previousWidth;
            }
            if (stylesAreEqual && coupleWidth === undefined) {
                // we can measure the kerning couple and subtract the width of the previous character
                coupleWidth = ctx.measureText(couple).width;
                // @ts-ignore
                fontCache[couple] = coupleWidth;
                // safe to use the non-null since if undefined we defined it before.
                kernedWidth = coupleWidth - previousWidth!;
            }
        }
        return {
            height: height * fontMultiplier,
            width: width * fontMultiplier,
            kernedWidth: kernedWidth! * fontMultiplier,
        };
    }

    /**
   * @private
   * @param {CanvasRenderingContext2D} ctx Context to render on
   */
  _render(ctx: CanvasRenderingContext2D) {
    this._setTextStyles(ctx);
    // this._renderTextLinesBackground(ctx);
    // this._renderTextDecoration(ctx, 'underline');
    this._renderText(ctx);
    // this._renderTextDecoration(ctx, 'overline');
    // this._renderTextDecoration(ctx, 'linethrough');
  }

    measureVLine(lineIndex: number) {
        const lineInfo = this._measureLine(lineIndex);
        if (this.charSpacing !== 0) {
            lineInfo.height -= this._getHeightOfCharSpacing();
        }
        if (lineInfo.height < 0) {
            lineInfo.height = 0;
        }
        return lineInfo;
    }

    /**
     * パス機能は使えない
     * measure every grapheme of a line, populating __charBounds
     * @param {Number} lineIndex
     * @return {Object} object.width total width of characters
     * @return {Object} object.numOfSpaces length of chars that match this._reSpacesAndTabs
     */
    _measureLine(lineIndex: number) {
        let height = 0,
            prevGrapheme: string | undefined,
            graphemeInfo: GraphemeBBox | undefined;

        const line = this._textLines[lineIndex],
            llength = line.length,
            lineBounds = new Array<GraphemeBBox>(llength);

        //@ts-ignore
        this.__charBounds[lineIndex] = lineBounds;
        for (let i = 0; i < llength; i++) {
            const grapheme = line[i];
            graphemeInfo = this._getGraphemeBox(grapheme, lineIndex, i, prevGrapheme);
            lineBounds[i] = graphemeInfo;
            height += graphemeInfo.height;
            prevGrapheme = grapheme;
        }
        // this latest bound box represent the last character of the line
        // to simplify cursor handling in interactive mode.
        lineBounds[llength] = {
            left: graphemeInfo ? graphemeInfo.left + graphemeInfo.width : 0,
            width: this.fontSize,
            kernedWidth: 0,
            // height: this.fontSize,
            height: 0,
            deltaY: 0,
        } as GraphemeBBox;

        return { width: this.fontSize, numOfSpaces: 0, height: height };
    }

    /**
     *
     * @param {String} grapheme to be measured
     * @param {Number} lineIndex index of the line where the char is
     * @param {Number} charIndex position in the line
     * @param {String} [prevGrapheme] character preceding the one to be measured
     * @returns {GraphemeBBox} grapheme bbox
     */
    _getGraphemeBox(
        grapheme: string,
        lineIndex: number,
        charIndex: number,
        prevGrapheme?: string,
        skipLeft?: boolean,
    ): GraphemeBBox {
        const style = this.getCompleteStyleDeclaration(lineIndex, charIndex),
            prevStyle = prevGrapheme
                ? this.getCompleteStyleDeclaration(lineIndex, charIndex - 1)
                : {},
            info = this._measureChar(grapheme, style, prevGrapheme, prevStyle);
        let kernedWidth = info.kernedWidth,
            width = info.width,
            height = info.height,
            charSpacing;

        if (this.charSpacing !== 0) {
            charSpacing = this._getWidthOfCharSpacing();
            width += charSpacing;
            kernedWidth += charSpacing;
        }

        const box: GraphemeBBox = {
            width,
            left: 0,
            // height: style.fontSize,
            height,
            kernedWidth,
            deltaY: style.deltaY,
        };
        if (charIndex > 0 && !skipLeft) {
            // @ts-ignore
            const previousBox = this.__charBounds[lineIndex][charIndex - 1];
            box.left =
                previousBox.left + previousBox.width + info.kernedWidth - info.width;
        }
        return box;
    }

    /**
   * Calculate text box height measureing each line
   */
    calcTextHeight(): number {
        let maxHeight = this.getLineHeight(0);
        console.log({maxHeight})
        for (let i = 1, len = this._textLines.length; i < len; i++) {
            const currentLineHeight = this.getLineHeight(i);
            if (currentLineHeight > maxHeight) {
                maxHeight = currentLineHeight
            }
            console.log({maxHeight})
        }
        return maxHeight
    }


    /**
   * @private
   * @return {Number} Left offset
   */
    _getLeftOffset(): number {
        // @ts-ignore
        // return this.direction === 'ltr' ? -this.width / 2 : this.width / 2;
        return this.width / 2;
    }

    /**
     * @private
     * @return {Number} Top offset
     */
    _getTopOffset(): number {
        // @ts-ignore
        return -this.height / 2;
    }

    /**
 * @private
 * @param {CanvasRenderingContext2D} ctx Context to render on
 * @param {String} method Method name ("fillText" or "strokeText")
 */
    _renderTextCommon(
        ctx: CanvasRenderingContext2D,
        method: 'fillText' | 'strokeText'
    ) {
        ctx.save();
        // let lineHeights = 0
        let lineWidths = 0;
        const left = this._getLeftOffset(),
            top = this._getTopOffset();
        for (let i = 0, len = this._textLines.length; i < len; i++) {
            const widthOfLine = this.getWidthOfLine(i),
                // @ts-ignore
                maxHeight = widthOfLine / this.lineHeight,
                leftOffset = this._getLineLeftOffset(i);
            this._renderVTextLine(
                method,
                ctx,
                this._textLines[i],
                // left + leftOffset,
                left - lineWidths,
                // top + lineHeights + maxHeight,
                top,
                i
            );
            // lineHeights += heightOfLine;
            lineWidths += widthOfLine
        }
        ctx.restore();
    }

    /**
   * @private
   * @param {String} method fillText or strokeText.
   * @param {CanvasRenderingContext2D} ctx Context to render on
   * @param {Array} line Content of the line, splitted in an array by grapheme
   * @param {Number} left
   * @param {Number} top
   * @param {Number} lineIndex
   */
    _renderChars(
        method: 'fillText' | 'strokeText',
        ctx: CanvasRenderingContext2D,
        line: string,
        left: number,
        top: number,
        lineIndex: number
    ) {
        const lineHeight = this.getHeightOfLine(lineIndex)
        //@ts-ignore
        const isJustify = this.textAlign.includes(JUSTIFY)
        const shortCut =
            !isJustify &&
            this.charSpacing === 0 &&
            this.isEmptyStyles(lineIndex)
        const isLtr = this.direction === 'ltr'
        const sign = this.direction === 'ltr' ? 1 : -1
        // this was changed in the PR #7674
        // currentDirection = ctx.canvas.getAttribute('dir');
        const currentDirection = ctx.direction;

        let actualStyle,
            nextStyle,
            charsToRender = '',
            charBox,
            boxWidth = 0,
            boxHeight = 0,
            timeToRender,
            drawingLeft;

        ctx.save();
        if (currentDirection !== this.direction) {
            ctx.canvas.setAttribute('dir', isLtr ? 'ltr' : 'rtl');
            ctx.direction = isLtr ? 'ltr' : 'rtl';
            ctx.textAlign = isLtr ? LEFT : RIGHT;
        }
        // top -= (lineHeight * this._fontSizeFraction) / this.lineHeight;

        if (shortCut) {
            // render all the line in one pass without checking
            // drawingLeft = isLtr ? left : left - this.getLineWidth(lineIndex);
            // this._renderChar(method, ctx, lineIndex, 0, line.join(''), left, top);
            this._renderChar(method, ctx, lineIndex, 0, line, left, top);
            ctx.restore();
            return;
        }

        // 各文字の描画
        for (let i = 0, len = line.length - 1; i <= len; i++) {
            timeToRender = i === len || this.charSpacing;
            charsToRender += line[i];

            // @ts-ignore
            charBox = this.__charBounds[lineIndex][i] as Required<GraphemeBBox>;
            if (boxWidth === 0) {
                left += sign * (charBox.kernedWidth - charBox.width);
                boxWidth += charBox.width;
            } else {
                boxWidth += charBox.kernedWidth;
            }
            boxHeight += charBox.height
            if (isJustify && !timeToRender) {
                if (this._reSpaceAndTab.test(line[i])) {
                    timeToRender = true;
                }
            }
            if (!timeToRender) {
                // if we have charSpacing, we render char by char
                actualStyle =
                    actualStyle || this.getCompleteStyleDeclaration(lineIndex, i);
                nextStyle = this.getCompleteStyleDeclaration(lineIndex, i + 1);
                timeToRender = hasStyleChanged(actualStyle, nextStyle, false);
            }
            if (timeToRender) {

                drawingLeft = left;
                this._renderChar(
                    method,
                    ctx,
                    lineIndex,
                    i,
                    charsToRender,
                    drawingLeft,
                    top
                );

                charsToRender = '';
                actualStyle = nextStyle;
                left += sign * boxWidth;
                boxWidth = 0;
            }
        }
        ctx.restore();
    }

    handleFiller<T extends 'fill' | 'stroke'>(
        ctx: CanvasRenderingContext2D,
        property: `${T}Style`,
    ): { offsetX: number; offsetY: number } {
        // filter無効
        return { offsetX: 0, offsetY: 0 };
    }

    /**
   * This function prepare the canvas for a stroke style, and stroke and strokeWidth
   * need to be sent in as defined
   * @param {CanvasRenderingContext2D} ctx
   * @param {CompleteTextStyleDeclaration} style with stroke and strokeWidth defined
   * @returns
   */
    _setStrokeStyles(
        ctx: CanvasRenderingContext2D,
        {
            stroke,
            strokeWidth,
        }: Pick<CompleteTextStyleDeclaration, 'stroke' | 'strokeWidth'>
    ) {
        ctx.lineWidth = this.strokeWidth!;
        if (this.strokeLineCap) {
            ctx.lineCap = this.strokeLineCap as CanvasLineCap
        }
        if (this.strokeDashOffset) {
            ctx.lineDashOffset = this.strokeDashOffset
        }
        if (this.strokeLineJoin) {
            ctx.lineJoin = this.strokeLineJoin as CanvasLineJoin
        }
        if (this.strokeMiterLimit) {
            ctx.miterLimit = this.strokeMiterLimit;
        }

    }

    /**
     * This function prepare the canvas for a ill style, and fill
     * need to be sent in as defined
     * @param {CanvasRenderingContext2D} ctx
     * @param {CompleteTextStyleDeclaration} style with ill defined
     * @returns
     */
    _setFillStyles(ctx: CanvasRenderingContext2D, { fill }: Pick<this, 'fill'>) {

    }

    /**
   * @private
   * @param {String} method
   * @param {CanvasRenderingContext2D} ctx Context to render on
   * @param {Number} lineIndex
   * @param {Number} charIndex
   * @param {String} _char
   * @param {Number} left Left coordinate
   * @param {Number} top Top coordinate
   * @param {Number} lineHeight Height of the line
   */
    _renderChar(method: string, ctx: CanvasRenderingContext2D, lineIndex: number, charIndex: number, _char: string, left: number, top: number): void {
        const decl = this._getStyleDeclaration(lineIndex, charIndex),
            fullDecl = this.getCompleteStyleDeclaration(lineIndex, charIndex),
            shouldFill = method === 'fillText' && fullDecl.fill,
            shouldStroke =
                method === 'strokeText' && fullDecl.stroke && fullDecl.strokeWidth;

        if (!shouldStroke && !shouldFill) {
            return;
        }
        ctx.save();

        ctx.font = this._getFontDeclaration(fullDecl);

        console.log({ decl })
        if (decl) {
            if (decl.textBackgroundColor) {
                this._removeShadow(ctx);
            }
            if (decl.deltaY) {
                top += decl.deltaY;
            }
        }

        if (shouldFill) {
            // const fillOffsets = this._setFillStyles(ctx, fullDecl);
            this._setFillStyles(ctx, fullDecl);

            let t = top
            _char.split('').forEach((c, i) => {
                const bound = this.__charBounds![lineIndex][i]
                t += bound.height!
                ctx.fillText(c, left - bound.width, t)

                
            })
        }

        if (shouldStroke) {
            // const strokeOffsets = this._setStrokeStyles(ctx, fullDecl);
            this._setStrokeStyles(ctx, fullDecl);
            ctx.strokeText(
                _char,
                left, // - strokeOffsets.offsetX,
                top, // - strokeOffsets.offsetY
            );
        }

        ctx.restore();
    }

    _getLineLeftOffset(lineIndex: number): number {
        return 0
    }

    getLineHeight(lineIndex: number): number {
        if (this.__lineHeights[lineIndex] !== undefined) {
            return this.__lineHeights[lineIndex]
        }

        const { height } = this.measureVLine(lineIndex)
        console.log({height})
        this.__lineHeights[lineIndex] = height
        return height
    }

    // getLineWidth(lineIndex: number): number {
    //     if (this.__lineWidths[lineIndex] !== undefined) {
    //         return this.__lineWidths[lineIndex];
    //       }

    //       const { width } = this.measureLine(lineIndex);
    //       this.__lineWidths[lineIndex] = width;
    //       return width;
    // }

    _getHeightOfCharSpacing() {
        if (this.charSpacing !== 0) {
            // @ts-ignore
            return (this.fontSize * this.charSpacing) / 1000
        }
        return 0
    }

    /**
   * return font declaration string for canvas context
   * @param {Object} [styleObject] object
   * @returns {String} font declaration formatted for canvas context.
   */
    _getFontDeclaration(
        {
            fontFamily = this.fontFamily,
            fontStyle = this.fontStyle,
            fontWeight = this.fontWeight,
            fontSize = this.fontSize,
        }: Partial<
            Pick<
                TextStyleDeclaration,
                'fontFamily' | 'fontStyle' | 'fontWeight' | 'fontSize'
            >
        > = {},
        forMeasuring?: boolean
    ): string {
        const parsedFontFamily =
            // @ts-ignore
            fontFamily.includes("'") ||
                // @ts-ignore
                fontFamily.includes('"') ||
                // @ts-ignore
                fontFamily.includes(',') ||
                // @ts-ignore
                VerticalText.genericFonts.includes(fontFamily.toLowerCase())
                ? fontFamily
                : `"${fontFamily}"`;
        return [
            fontStyle,
            fontWeight,
            `${forMeasuring ? this.CACHE_FONT_SIZE : fontSize}px`,
            parsedFontFamily,
        ].join(' ');
    }

}