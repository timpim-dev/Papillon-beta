package xyz.getpapillon.wear

import android.app.PendingIntent
import android.content.Intent
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService

class PapillonComplicationService : SuspendingComplicationDataSourceService() {

  override fun getPreviewData(type: ComplicationType): ComplicationData? {
    return buildComplication(
      type = type,
      shortText = "Maths",
      shortTitle = "09:00",
      longText = "📐 Mathématiques",
      longTitle = "09:00 – 10:00 • Salle 204"
    )
  }

  override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData? {
    val snapshot = WearRepository.loadCached(applicationContext)
    val prefs = WearRepository.localPreferences.value
    val metric = snapshot?.effectiveComplicationMetric(prefs) ?: prefs.complicationMetric

    val now = System.currentTimeMillis()
    val nextCourse = snapshot?.nextClasses?.firstOrNull { !it.isCanceled && it.to > now }
      ?: snapshot?.nextClasses?.firstOrNull()
    val pendingTasks = snapshot?.tasks?.filter { !it.isDone }.orEmpty()
    val overallAvg = snapshot?.overallAverage

    val (shortText, shortTitle, longText, longTitle) = when (metric) {
      "tasks_count" -> {
        val count = pendingTasks.size
        val topTask = pendingTasks.firstOrNull()
        Quad(
          if (count == 0) "0 dev." else "$count dev.",
          "Papillon +",
          if (count == 0) "Aucun devoir" else "$count devoirs à faire",
          topTask?.let { "${it.emoji ?: "📝"} ${it.subject}" } ?: "Tout est à jour"
        )
      }
      "overall_average" -> {
        val avg = overallAvg ?: "--"
        Quad(
          avg,
          "Moyenne",
          "Moyenne : $avg",
          snapshot?.accountName ?: "Papillon +"
        )
      }
      else -> {
        if (nextCourse != null) {
          val prefix = nextCourse.emoji?.let { "$it " } ?: ""
          val roomPart = nextCourse.room?.takeIf { it.isNotBlank() }?.let { " • $it" } ?: ""
          Quad(
            nextCourse.subject.take(10),
            WearFormatters.formatHour(nextCourse.from).ifEmpty { "Cours" },
            "$prefix${nextCourse.subject}",
            "${WearFormatters.formatTimeRange(nextCourse.from, nextCourse.to)}$roomPart"
          )
        } else {
          Quad(
            "Libre",
            "Papillon +",
            "Aucun cours à venir",
            "${pendingTasks.size} devoirs restants"
          )
        }
      }
    }

    return buildComplication(
      type = request.complicationType,
      shortText = shortText,
      shortTitle = shortTitle,
      longText = longText,
      longTitle = longTitle
    )
  }

  private fun buildComplication(
    type: ComplicationType,
    shortText: String,
    shortTitle: String,
    longText: String,
    longTitle: String
  ): ComplicationData? {
    val tapIntent = PendingIntent.getActivity(
      applicationContext,
      0,
      Intent(applicationContext, WearMainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    return when (type) {
      ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(
        text = PlainComplicationText.Builder(shortText).build(),
        contentDescription = PlainComplicationText.Builder(longText).build()
      )
        .setTitle(PlainComplicationText.Builder(shortTitle).build())
        .setTapAction(tapIntent)
        .build()

      ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(
        text = PlainComplicationText.Builder(longText).build(),
        contentDescription = PlainComplicationText.Builder("$longText - $longTitle").build()
      )
        .setTitle(PlainComplicationText.Builder(longTitle).build())
        .setTapAction(tapIntent)
        .build()

      else -> null
    }
  }

  private data class Quad(
    val shortText: String,
    val shortTitle: String,
    val longText: String,
    val longTitle: String
  )
}
