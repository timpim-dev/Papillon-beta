package xyz.getpapillon.wear

import android.graphics.Bitmap
import android.graphics.Color
import com.google.zxing.BarcodeFormat
import com.google.zxing.MultiFormatWriter

object QrCodeGenerator {
  fun generate(data: String, type: String?, sizePx: Int = 360): Bitmap? {
    if (data.isBlank()) return null

    val format = when (type?.uppercase()) {
      "CODE39" -> BarcodeFormat.CODE_39
      "CODE128" -> BarcodeFormat.CODE_128
      "EAN13" -> BarcodeFormat.EAN_13
      else -> BarcodeFormat.QR_CODE
    }

    val width = sizePx
    val height = if (format == BarcodeFormat.QR_CODE) sizePx else (sizePx * 0.45).toInt()

    return try {
      val matrix = MultiFormatWriter().encode(data, format, width, height)
      val pixels = IntArray(width * height)
      for (y in 0 until height) {
        val offset = y * width
        for (x in 0 until width) {
          pixels[offset + x] = if (matrix[x, y]) Color.BLACK else Color.WHITE
        }
      }
      Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888)
    } catch (_: Throwable) {
      null
    }
  }
}
