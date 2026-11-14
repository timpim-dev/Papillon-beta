package xyz.getpapillon.wear.ui

import android.graphics.Bitmap
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.ScalingLazyListState
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.itemsIndexed
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CircularProgressIndicator
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Switch
import androidx.wear.compose.material.SwitchDefaults
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.material.ToggleChip
import androidx.wear.compose.material.ToggleChipDefaults
import androidx.wear.compose.material.Vignette
import androidx.wear.compose.material.VignettePosition
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import xyz.getpapillon.wear.QrCodeGenerator
import xyz.getpapillon.wear.WearCanteenCard
import xyz.getpapillon.wear.WearCourse
import xyz.getpapillon.wear.WearFormatters
import xyz.getpapillon.wear.WearLocalPreferences
import xyz.getpapillon.wear.WearRepository
import xyz.getpapillon.wear.WearSnapshot
import xyz.getpapillon.wear.WearTask

private val DefaultAccent = Color(0xFF29947A)
private val CardDark = Color(0xFF141416)
private val CardDarkElevated = Color(0xFF1E1E22)
private val TextSecondaryDark = Color(0xFF98989F)

@Composable
fun PapillonWearApp() {
  val context = LocalContext.current
  LaunchedEffect(Unit) {
    WearRepository.loadCached(context)
    WearRepository.requestPhoneSync(context)
  }

  val snapshot by WearRepository.snapshot.collectAsState()
  val isSyncing by WearRepository.isSyncing.collectAsState()
  val localPrefs by WearRepository.localPreferences.collectAsState()
  val pendingApkPath by WearRepository.pendingApkPath.collectAsState()

  val syncGradient = snapshot?.effectiveSyncGradient(localPrefs) ?: localPrefs.syncThemeGradient
  val accentColor = remember(snapshot?.themeColor, syncGradient) {
    if (syncGradient) {
      Color(WearFormatters.parseColorInt(snapshot?.themeColor, DefaultAccent.toArgb()))
    } else {
      DefaultAccent
    }
  }
  val brightAccent = remember(snapshot?.themeColor, accentColor, syncGradient) {
    if (syncGradient && !snapshot?.themeColor.isNullOrBlank()) {
      Color(WearFormatters.adjustColor(snapshot?.themeColor, 0.25f, accentColor.toArgb()))
    } else {
      accentColor
    }
  }
  val gradientStops = remember(snapshot?.wallpaperGradientColors, accentColor, syncGradient) {
    if (!syncGradient) {
      listOf(Color.Black, Color.Black)
    } else {
      val parsed = snapshot?.wallpaperGradientColors.orEmpty().mapNotNull { hex ->
        val c = WearFormatters.parseColorInt(hex, -1)
        if (c == -1) null else Color(c)
      }
      when {
        parsed.size >= 2 -> listOf(
          parsed[0].copy(alpha = 0.50f),
          parsed[1].copy(alpha = 0.24f),
          Color.Black
        )
        parsed.size == 1 -> listOf(
          parsed[0].copy(alpha = 0.48f),
          parsed[0].copy(alpha = 0.14f),
          Color.Black
        )
        else -> listOf(
          accentColor.copy(alpha = 0.42f),
          accentColor.copy(alpha = 0.12f),
          Color.Black
        )
      }
    }
  }

  val colors = Colors(
    primary = accentColor,
    primaryVariant = brightAccent,
    secondary = brightAccent,
    secondaryVariant = accentColor,
    background = Color.Black,
    surface = CardDark,
    error = Color(0xFFFF6B6B),
    onPrimary = Color.Black,
    onSecondary = Color.Black,
    onBackground = Color.White,
    onSurface = Color.White,
    onSurfaceVariant = TextSecondaryDark,
    onError = Color.Black
  )

  MaterialTheme(colors = colors) {
    val navController = rememberSwipeDismissableNavController()
    SwipeDismissableNavHost(
      navController = navController,
      startDestination = "home"
    ) {
      composable("home") {
        HomeScreen(
          snapshot = snapshot,
          prefs = localPrefs,
          isSyncing = isSyncing,
          accentColor = accentColor,
          brightAccent = brightAccent,
          gradientStops = gradientStops,
          hasPendingUpdate = pendingApkPath != null,
          onNavigate = { route -> navController.navigate(route) },
          onSync = { WearRepository.requestPhoneSync(context) },
          onInstallUpdate = { WearRepository.installPendingApkUpdate(context) }
        )
      }
      composable("classes") {
        TimetableScreen(
          snapshot = snapshot,
          accentColor = brightAccent,
          gradientStops = gradientStops
        )
      }
      composable("tasks") {
        TasksScreen(
          snapshot = snapshot,
          accentColor = brightAccent,
          gradientStops = gradientStops,
          onOpenTask = { task ->
            navController.navigate("task_detail/${encodeId(task.id)}")
          },
          onToggleDone = { task ->
            WearRepository.toggleTaskDone(context, task.id, !task.isDone)
          }
        )
      }
      composable("task_detail/{taskKey}") { entry ->
        val key = entry.arguments?.getString("taskKey") ?: ""
        val taskId = decodeId(key)
        val task = snapshot?.tasks?.firstOrNull { it.id == taskId }
        TaskDetailScreen(
          task = task,
          accentColor = brightAccent,
          gradientStops = gradientStops,
          onToggleDone = { current ->
            WearRepository.toggleTaskDone(context, current.id, !current.isDone)
          }
        )
      }
      composable("grades") {
        GradesScreen(
          snapshot = snapshot,
          accentColor = brightAccent,
          gradientStops = gradientStops
        )
      }
      composable("canteen") {
        CanteenScreen(
          snapshot = snapshot,
          accentColor = brightAccent,
          gradientStops = gradientStops,
          onOpenQr = { index -> navController.navigate("canteen_qr/$index") }
        )
      }
      composable("canteen_qr/{index}") { entry ->
        val idx = entry.arguments?.getString("index")?.toIntOrNull() ?: 0
        val card = snapshot?.canteenCards?.getOrNull(idx)
        CanteenQrScreen(
          card = card,
          accentColor = brightAccent,
          gradientStops = gradientStops
        )
      }
      composable("customize") {
        CustomizeScreen(
          snapshot = snapshot,
          prefs = localPrefs,
          accentColor = accentColor,
          brightAccent = brightAccent,
          gradientStops = gradientStops,
          onToggleGradient = { enabled ->
            WearRepository.updateLocalPreferences(context) {
              it.copy(useCustomOverride = true, syncThemeGradient = enabled)
            }
          },
          onToggleSection = { sectionId, enabled ->
            WearRepository.updateLocalPreferences(context) { current ->
              val updated = if (enabled) {
                (current.enabledSections + sectionId).distinct()
              } else {
                current.enabledSections.filterNot { it == sectionId }
              }
              current.copy(useCustomOverride = true, enabledSections = updated)
            }
          },
          onSelectComplicationMetric = { metric ->
            WearRepository.updateLocalPreferences(context) {
              it.copy(useCustomOverride = true, complicationMetric = metric)
            }
          },
          onSelectTilePreset = { preset ->
            WearRepository.updateLocalPreferences(context) {
              it.copy(useCustomOverride = true, tilePreset = preset)
            }
          },
          onResetPhoneConfig = {
            WearRepository.resetToPhoneConfig(context)
          }
        )
      }
      composable("share") {
        ShareQrScreen(
          accentColor = brightAccent,
          gradientStops = gradientStops
        )
      }
    }
  }
}

@Composable
private fun WearScreenContainer(
  gradientStops: List<Color>,
  listState: ScalingLazyListState? = null,
  content: @Composable () -> Unit
) {
  Box(
    modifier = Modifier
      .fillMaxSize()
      .background(Brush.verticalGradient(gradientStops))
  ) {
    Scaffold(
      timeText = { TimeText() },
      vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
      positionIndicator = {
        if (listState != null) {
          PositionIndicator(scalingLazyListState = listState)
        }
      },
      content = content
    )
  }
}

@Composable
private fun HomeScreen(
  snapshot: WearSnapshot?,
  prefs: WearLocalPreferences,
  isSyncing: Boolean,
  accentColor: Color,
  brightAccent: Color,
  gradientStops: List<Color>,
  hasPendingUpdate: Boolean,
  onNavigate: (String) -> Unit,
  onSync: () -> Unit,
  onInstallUpdate: () -> Unit
) {
  val listState = rememberScalingLazyListState()
  val enabledSections = snapshot?.effectiveSections(prefs) ?: prefs.enabledSections
  val pendingTasksCount = snapshot?.tasks?.count { !it.isDone } ?: 0
  val nextClassesCount = snapshot?.nextClasses?.size ?: 0
  val gradesCount = snapshot?.latestGrades?.size ?: 0
  val cardsCount = snapshot?.canteenCards?.size ?: 0

  WearScreenContainer(gradientStops = gradientStops, listState = listState) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 8.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
      item {
        Spacer(modifier = Modifier.height(10.dp))
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
          Text(
            text = "Papillon +",
            color = brightAccent,
            fontSize = 15.sp,
            fontWeight = FontWeight.Bold
          )
          val subtitle = buildList {
            snapshot?.accountName?.takeIf { it.isNotBlank() }?.let { add(it) }
            snapshot?.overallAverage?.takeIf { it.isNotBlank() }?.let { add("Moy. $it") }
          }.joinToString(" • ")
          if (subtitle.isNotEmpty()) {
            Text(
              text = subtitle,
              color = Color.White.copy(alpha = 0.78f),
              fontSize = 11.sp,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
          }
        }
      }

      if (hasPendingUpdate) {
        item {
          Chip(
            onClick = onInstallUpdate,
            modifier = Modifier.fillMaxWidth(),
            colors = ChipDefaults.primaryChipColors(
              backgroundColor = brightAccent,
              contentColor = Color.Black
            ),
            label = {
              Text(
                text = "Installer mise à jour",
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
              )
            },
            secondaryLabel = {
              Text(text = "Reçue du téléphone", maxLines = 1)
            }
          )
        }
      }

      if (snapshot == null) {
        item {
          EmptyCard("Ouvre Papillon + sur ton téléphone pour synchroniser")
        }
      }

      items(enabledSections) { sectionId ->
        when (sectionId) {
          "classes" -> {
            val nowMs = System.currentTimeMillis()
            val upcoming = snapshot?.nextClasses?.firstOrNull { !it.isCanceled && it.to > nowMs }
              ?: snapshot?.nextClasses?.firstOrNull()
            HomeMenuChip(
              title = "Emploi du temps",
              subtitle = upcoming?.let { c ->
                val hour = WearFormatters.formatHour(c.from)
                val room = c.room?.trim()?.takeIf { it.isNotEmpty() }?.let { " • $it" } ?: ""
                "$hour$room · ${c.subject}"
              } ?: "$nextClassesCount cours",
              badgeEmoji = "📅",
              accentColor = brightAccent,
              onClick = { onNavigate("classes") }
            )
          }
          "tasks" -> HomeMenuChip(
            title = "Devoirs",
            subtitle = if (pendingTasksCount == 0) {
              "Tout est à jour"
            } else {
              "$pendingTasksCount à faire"
            },
            badgeEmoji = "✅",
            accentColor = brightAccent,
            onClick = { onNavigate("tasks") }
          )
          "grades" -> HomeMenuChip(
            title = "Notes",
            subtitle = snapshot?.latestGrades?.firstOrNull()?.let {
              "${it.subject} : ${it.score}${it.outOf}"
            } ?: "$gradesCount notes",
            badgeEmoji = "📊",
            accentColor = brightAccent,
            onClick = { onNavigate("grades") }
          )
          "canteen" -> HomeMenuChip(
            title = "Cartes cantine",
            subtitle = snapshot?.canteenCards?.firstOrNull()?.balanceText
              ?: "$cardsCount carte(s)",
            badgeEmoji = "🍽️",
            accentColor = brightAccent,
            onClick = { onNavigate("canteen") }
          )
        }
      }

      item {
        HomeMenuChip(
          title = "Personnaliser",
          subtitle = "Sections, thème & cadran",
          badgeEmoji = "🎨",
          accentColor = brightAccent,
          onClick = { onNavigate("customize") }
        )
      }

      item {
        HomeMenuChip(
          title = "Partager Papillon +",
          subtitle = "QR code téléchargement",
          badgeEmoji = "📲",
          accentColor = brightAccent,
          onClick = { onNavigate("share") }
        )
      }

      item {
        Chip(
          onClick = onSync,
          modifier = Modifier.fillMaxWidth(),
          colors = ChipDefaults.secondaryChipColors(
            backgroundColor = accentColor.copy(alpha = 0.24f),
            contentColor = Color.White
          ),
          label = {
            Row(verticalAlignment = Alignment.CenterVertically) {
              if (isSyncing) {
                CircularProgressIndicator(
                  modifier = Modifier.size(16.dp),
                  strokeWidth = 2.dp,
                  indicatorColor = brightAccent
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text("Synchronisation...", maxLines = 1)
              } else {
                Text("↻  Actualiser", maxLines = 1, fontWeight = FontWeight.SemiBold)
              }
            }
          }
        )
      }

      item { Spacer(modifier = Modifier.height(14.dp)) }
    }
  }
}

@Composable
private fun HomeMenuChip(
  title: String,
  subtitle: String,
  badgeEmoji: String,
  accentColor: Color,
  onClick: () -> Unit
) {
  Chip(
    onClick = onClick,
    modifier = Modifier.fillMaxWidth(),
    colors = ChipDefaults.secondaryChipColors(
      backgroundColor = CardDark.copy(alpha = 0.92f),
      contentColor = Color.White,
      secondaryContentColor = TextSecondaryDark
    ),
    icon = {
      Box(
        modifier = Modifier
          .size(28.dp)
          .clip(CircleShape)
          .background(accentColor.copy(alpha = 0.20f)),
        contentAlignment = Alignment.Center
      ) {
        Text(text = badgeEmoji, fontSize = 13.sp)
      }
    },
    label = {
      Text(
        text = title,
        fontWeight = FontWeight.SemiBold,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
    },
    secondaryLabel = {
      Text(
        text = subtitle,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis
      )
    }
  )
}

@Composable
private fun TimetableScreen(
  snapshot: WearSnapshot?,
  accentColor: Color,
  gradientStops: List<Color>
) {
  val listState = rememberScalingLazyListState()
  val now = System.currentTimeMillis()
  val allSorted = remember(snapshot?.nextClasses) {
    val sorted = snapshot?.nextClasses.orEmpty().sortedBy { it.from }
    val upcoming = sorted.filter { it.to > now }
    if (upcoming.isNotEmpty()) upcoming else sorted
  }

  val dayGroups = remember(allSorted) {
    allSorted
      .groupBy { WearFormatters.dayKey(it.from) }
      .entries
      .filter { it.key.isNotEmpty() }
      .toList()
  }

  var selectedDayKey by remember { mutableStateOf<String?>(null) }
  val activeDayKey = if (selectedDayKey != null && dayGroups.any { it.key == selectedDayKey }) {
    selectedDayKey
  } else {
    null
  }
  val visibleGroups = if (activeDayKey != null) {
    dayGroups.filter { it.key == activeDayKey }
  } else {
    dayGroups
  }

  WearScreenContainer(gradientStops = gradientStops, listState = listState) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 8.dp),
      verticalArrangement = Arrangement.spacedBy(6.dp),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item(key = "timetable_header") {
        ScreenHeader(title = "Emploi du temps", accentColor = accentColor)
      }

      if (dayGroups.size > 1) {
        item(key = "timetable_day_filters") {
          Row(
            modifier = Modifier
              .fillMaxWidth()
              .horizontalScroll(rememberScrollState())
              .padding(vertical = 2.dp),
            horizontalArrangement = Arrangement.spacedBy(5.dp)
          ) {
            DayFilterPill(
              label = "Tous",
              selected = activeDayKey == null,
              accentColor = accentColor,
              onClick = { selectedDayKey = null }
            )
            dayGroups.forEach { (dayKey, groupCourses) ->
              val chipLabel = WearFormatters.formatShortDayChip(groupCourses.first().from)
              DayFilterPill(
                label = chipLabel,
                selected = activeDayKey == dayKey,
                accentColor = accentColor,
                onClick = {
                  selectedDayKey = if (activeDayKey == dayKey) null else dayKey
                }
              )
            }
          }
        }
      }

      if (visibleGroups.isEmpty()) {
        item(key = "timetable_empty") { EmptyCard("Aucun cours à venir") }
      } else {
        visibleGroups.forEach { (dayKey, dayCourses) ->
          item(key = "day_header_$dayKey") {
            DaySectionHeader(
              title = WearFormatters.formatDaySectionHeader(dayCourses.first().from),
              accentColor = accentColor
            )
          }

          dayCourses.forEachIndexed { idx, course ->
            if (idx > 0) {
              val gapMs = course.from - dayCourses[idx - 1].to
              if (gapMs >= 20 * 60_000L) {
                item(key = "break_${dayKey}_$idx") {
                  BreakSeparatorPill(durationMs = gapMs)
                }
              }
            }
            item(key = "course_${dayKey}_${course.id}_${course.from}_$idx") {
              WearCourseCard(course = course, fallbackAccent = accentColor)
            }
          }
        }
      }

      item(key = "timetable_bottom_spacer") { Spacer(modifier = Modifier.height(14.dp)) }
    }
  }
}

@Composable
private fun DayFilterPill(
  label: String,
  selected: Boolean,
  accentColor: Color,
  onClick: () -> Unit
) {
  Box(
    modifier = Modifier
      .clip(RoundedCornerShape(50))
      .background(if (selected) accentColor else CardDarkElevated)
      .clickable(onClick = onClick)
      .padding(horizontal = 10.dp, vertical = 5.dp),
    contentAlignment = Alignment.Center
  ) {
    Text(
      text = label,
      color = if (selected) Color.Black else Color.White,
      fontSize = 11.sp,
      fontWeight = FontWeight.Bold,
      maxLines = 1
    )
  }
}

@Composable
private fun DaySectionHeader(title: String, accentColor: Color) {
  Row(
    modifier = Modifier
      .fillMaxWidth()
      .padding(horizontal = 4.dp, vertical = 2.dp),
    verticalAlignment = Alignment.CenterVertically
  ) {
    Text(
      text = title,
      color = accentColor,
      fontSize = 11.5.sp,
      fontWeight = FontWeight.Bold,
      maxLines = 1,
      overflow = TextOverflow.Ellipsis
    )
  }
}

@Composable
private fun BreakSeparatorPill(durationMs: Long) {
  val totalMinutes = (durationMs / 60_000L).toInt().coerceAtLeast(1)
  val hours = totalMinutes / 60
  val mins = totalMinutes % 60
  val label = when {
    hours > 0 && mins > 0 -> "Pause · ${hours}h ${mins} min"
    hours > 0 -> "Pause · ${hours}h"
    else -> "Pause · ${mins} min"
  }
  Box(
    modifier = Modifier
      .fillMaxWidth()
      .clip(RoundedCornerShape(14.dp))
      .background(CardDarkElevated.copy(alpha = 0.9f))
      .padding(horizontal = 10.dp, vertical = 6.dp),
    contentAlignment = Alignment.Center
  ) {
    Text(
      text = label,
      color = TextSecondaryDark,
      fontSize = 10.5.sp,
      fontWeight = FontWeight.Medium,
      maxLines = 1
    )
  }
}

@Composable
private fun WearCourseCard(course: WearCourse, fallbackAccent: Color) {
  val fallbackInt = fallbackAccent.toArgb()
  val bgColor = if (course.isCanceled) {
    Color(0xFF231214)
  } else {
    Color(WearFormatters.adjustColor(course.color, -0.70f, fallbackInt))
  }
  val textColor = if (course.isCanceled) {
    Color(0xFFE57373)
  } else {
    Color(WearFormatters.adjustColor(course.color, 0.10f, fallbackInt))
  }

  Row(
    modifier = Modifier
      .fillMaxWidth()
      .height(IntrinsicSize.Min)
      .clip(RoundedCornerShape(16.dp))
      .background(bgColor)
      .padding(horizontal = 10.dp, vertical = 8.dp),
    verticalAlignment = Alignment.CenterVertically
  ) {
    Box(
      modifier = Modifier
        .width(4.dp)
        .fillMaxHeight()
        .clip(RoundedCornerShape(4.dp))
        .background(textColor)
    )
    Spacer(modifier = Modifier.width(8.dp))
    Column(
      modifier = Modifier.weight(1f),
      verticalArrangement = Arrangement.spacedBy(2.dp)
    ) {
      val timeRange = WearFormatters.formatTimeRange(course.from, course.to)
      val duration = WearFormatters.formatDuration(course.from, course.to)
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Text(
          text = if (course.isCanceled) "Annulé · $timeRange" else timeRange,
          color = textColor.copy(alpha = 0.9f),
          fontSize = 10.5.sp,
          fontWeight = FontWeight.Bold,
          maxLines = 1
        )
        Text(
          text = duration,
          color = textColor.copy(alpha = 0.78f),
          fontSize = 10.sp,
          maxLines = 1
        )
      }
      // Matches in-app Course.tsx: no emoji prefix in course title
      Text(
        text = course.subject,
        color = textColor,
        fontSize = 12.5.sp,
        fontWeight = FontWeight.Bold,
        textDecoration = if (course.isCanceled) TextDecoration.LineThrough else null,
        maxLines = 2,
        overflow = TextOverflow.Ellipsis
      )
      val details = listOfNotNull(
        course.room?.takeIf { it.isNotBlank() },
        course.teacher?.takeIf { it.isNotBlank() }
      ).joinToString("  |  ")
      if (details.isNotEmpty()) {
        Text(
          text = details,
          color = textColor.copy(alpha = 0.85f),
          fontSize = 10.5.sp,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis
        )
      }
    }
  }
}

@Composable
private fun TasksScreen(
  snapshot: WearSnapshot?,
  accentColor: Color,
  gradientStops: List<Color>,
  onOpenTask: (WearTask) -> Unit,
  onToggleDone: (WearTask) -> Unit
) {
  val listState = rememberScalingLazyListState()
  val allTasks = snapshot?.tasks.orEmpty()
  val pendingByDay = remember(allTasks) {
    allTasks
      .filter { !it.isDone }
      .sortedBy { it.dueDate }
      .groupBy { WearFormatters.dayKey(it.dueDate) }
  }
  val completedTasks = remember(allTasks) {
    allTasks.filter { it.isDone }.sortedBy { it.dueDate }
  }

  WearScreenContainer(gradientStops = gradientStops, listState = listState) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 8.dp),
      verticalArrangement = Arrangement.spacedBy(6.dp),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item(key = "tasks_header") {
        ScreenHeader(title = "Devoirs", accentColor = accentColor)
      }

      if (allTasks.isEmpty()) {
        item(key = "tasks_empty") { EmptyCard("Aucun devoir à faire") }
      } else {
        pendingByDay.entries.forEachIndexed { groupIdx, (dayKey, dayTasks) ->
          val sectionTitle = WearFormatters.formatDaySectionHeader(dayTasks.first().dueDate)
          item(key = "task_day_${dayKey}_$groupIdx") {
            DaySectionHeader(title = sectionTitle, accentColor = accentColor)
          }
          itemsIndexed(dayTasks, key = { idx, t -> "task_${dayKey}_${t.id}_$idx" }) { _, task ->
            WearTaskCard(
              task = task,
              fallbackAccent = accentColor,
              onClick = { onOpenTask(task) },
              onToggleDone = { onToggleDone(task) }
            )
          }
        }

        if (completedTasks.isNotEmpty()) {
          item(key = "tasks_done_header") {
            DaySectionHeader(
              title = "Terminés",
              accentColor = Color.White.copy(alpha = 0.55f)
            )
          }
          itemsIndexed(completedTasks, key = { idx, t -> "task_done_${t.id}_$idx" }) { _, task ->
            WearTaskCard(
              task = task,
              fallbackAccent = accentColor,
              onClick = { onOpenTask(task) },
              onToggleDone = { onToggleDone(task) }
            )
          }
        }
      }

      item(key = "tasks_bottom_spacer") { Spacer(modifier = Modifier.height(14.dp)) }
    }
  }
}

@Composable
private fun WearTaskCard(
  task: WearTask,
  fallbackAccent: Color,
  onClick: () -> Unit,
  onToggleDone: () -> Unit
) {
  val subjectColor = Color(
    WearFormatters.adjustColor(task.color, 0.30f, fallbackAccent.toArgb())
  )
  val checkFill = if (task.isDone) {
    fallbackAccent.copy(alpha = 0.24f)
  } else {
    CardDarkElevated
  }
  val checkTextColor = if (task.isDone) fallbackAccent else TextSecondaryDark

  Column(
    modifier = Modifier
      .fillMaxWidth()
      .clip(RoundedCornerShape(18.dp))
      .background(CardDark.copy(alpha = if (task.isDone) 0.65f else 0.94f))
      .clickable(onClick = onClick)
      .padding(horizontal = 11.dp, vertical = 9.dp),
    verticalArrangement = Arrangement.spacedBy(4.dp)
  ) {
    Row(
      modifier = Modifier.fillMaxWidth(),
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.SpaceBetween
    ) {
      val subjectTitle = if (!task.emoji.isNullOrBlank()) {
        "${task.emoji} ${task.subject}"
      } else {
        task.subject
      }
      Text(
        text = subjectTitle,
        color = subjectColor.copy(alpha = if (task.isDone) 0.6f else 1f),
        fontSize = 11.5.sp,
        fontWeight = FontWeight.Bold,
        maxLines = 1,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
          .weight(1f)
          .padding(end = 6.dp)
      )
      Box(
        modifier = Modifier
          .size(22.dp)
          .clip(CircleShape)
          .background(checkFill)
          .clickable(onClick = onToggleDone),
        contentAlignment = Alignment.Center
      ) {
        Text(
          text = "✓",
          color = checkTextColor,
          fontSize = 11.sp,
          fontWeight = FontWeight.Bold
        )
      }
    }

    // Matches in-app Task.tsx: clean task description only, never date in title/preview
    Text(
      text = task.description.ifBlank { "Devoir à faire" },
      color = Color.White.copy(alpha = if (task.isDone) 0.50f else 0.95f),
      fontSize = 12.sp,
      fontWeight = FontWeight.Medium,
      textDecoration = if (task.isDone) TextDecoration.LineThrough else null,
      maxLines = 2,
      overflow = TextOverflow.Ellipsis
    )
  }
}

@Composable
private fun TaskDetailScreen(
  task: WearTask?,
  accentColor: Color,
  gradientStops: List<Color>,
  onToggleDone: (WearTask) -> Unit
) {
  val listState = rememberScalingLazyListState()

  WearScreenContainer(gradientStops = gradientStops, listState = listState) {
    if (task == null) {
      Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyCard("Devoir introuvable")
      }
      return@WearScreenContainer
    }

    val subjectColor = Color(
      WearFormatters.adjustColor(task.color, 0.30f, accentColor.toArgb())
    )
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 10.dp),
      verticalArrangement = Arrangement.spacedBy(8.dp),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item {
        Spacer(modifier = Modifier.height(12.dp))
        Text(
          text = if (!task.emoji.isNullOrBlank()) "${task.emoji} ${task.subject}" else task.subject,
          color = subjectColor,
          fontSize = 14.sp,
          fontWeight = FontWeight.Bold,
          textAlign = TextAlign.Center
        )
        val relativeDue = WearFormatters.formatRelativeDue(task.dueDate)
        val fullDate = WearFormatters.formatFullDateTime(task.dueDate)
        val dateText = listOfNotNull(
          relativeDue.takeIf { it.isNotBlank() },
          fullDate.takeIf { it.isNotBlank() }
        ).joinToString(" · ")
        if (dateText.isNotEmpty()) {
          Text(
            text = dateText,
            color = TextSecondaryDark,
            fontSize = 11.sp,
            textAlign = TextAlign.Center
          )
        }
      }

      item {
        Box(
          modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(18.dp))
            .background(CardDark.copy(alpha = 0.94f))
            .padding(11.dp)
        ) {
          Text(
            text = task.description.ifBlank { "Aucune consigne détaillée" },
            color = Color.White,
            fontSize = 12.sp,
            lineHeight = 16.sp
          )
        }
      }

      item {
        Chip(
          onClick = { onToggleDone(task) },
          modifier = Modifier.fillMaxWidth(),
          colors = ChipDefaults.primaryChipColors(
            backgroundColor = if (task.isDone) CardDarkElevated else accentColor,
            contentColor = if (task.isDone) Color.White else Color.Black
          ),
          label = {
            Text(
              text = if (task.isDone) "Marquer à faire" else "✓ Marquer terminé",
              fontWeight = FontWeight.Bold,
              textAlign = TextAlign.Center,
              modifier = Modifier.fillMaxWidth()
            )
          }
        )
      }

      item { Spacer(modifier = Modifier.height(16.dp)) }
    }
  }
}

@Composable
private fun GradesScreen(
  snapshot: WearSnapshot?,
  accentColor: Color,
  gradientStops: List<Color>
) {
  val listState = rememberScalingLazyListState()
  val grades = snapshot?.latestGrades.orEmpty()

  WearScreenContainer(gradientStops = gradientStops, listState = listState) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 8.dp),
      verticalArrangement = Arrangement.spacedBy(6.dp),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item {
        ScreenHeader(title = "Notes", accentColor = accentColor)
      }
      snapshot?.overallAverage?.takeIf { it.isNotBlank() }?.let { avg ->
        item {
          Box(
            modifier = Modifier
              .fillMaxWidth()
              .clip(RoundedCornerShape(16.dp))
              .background(CardDark.copy(alpha = 0.92f))
              .border(1.dp, accentColor.copy(alpha = 0.35f), RoundedCornerShape(16.dp))
              .padding(10.dp),
            contentAlignment = Alignment.Center
          ) {
            Text(
              text = "Moyenne générale : $avg",
              color = accentColor,
              fontSize = 13.sp,
              fontWeight = FontWeight.Bold
            )
          }
        }
      }
      if (grades.isEmpty()) {
        item { EmptyCard("Aucune note récente") }
      } else {
        itemsIndexed(grades, key = { idx, g -> "grade_${g.id}_$idx" }) { _, grade ->
          val fallbackInt = accentColor.toArgb()
          val cardBg = Color(WearFormatters.adjustColor(grade.color, -0.82f, fallbackInt))
          val tintedText = Color(WearFormatters.adjustColor(grade.color, 0.50f, fallbackInt))
          val secondaryText = tintedText.copy(alpha = 0.72f)

          Box(
            modifier = Modifier
              .fillMaxWidth()
              .clip(RoundedCornerShape(18.dp))
              .background(cardBg)
              .padding(horizontal = 11.dp, vertical = 9.dp)
          ) {
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Column(modifier = Modifier.weight(1f).padding(end = 6.dp)) {
                val emojiPrefix = if (!grade.emoji.isNullOrBlank()) "${grade.emoji} " else ""
                val dateLabel = WearFormatters.formatShortDate(grade.date)
                val header = listOfNotNull(
                  "$emojiPrefix${grade.subject}",
                  dateLabel.takeIf { it.isNotBlank() }
                ).joinToString(" · ")
                Text(
                  text = header,
                  color = secondaryText,
                  fontSize = 10.5.sp,
                  fontWeight = FontWeight.Medium,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
                Text(
                  text = grade.description.ifBlank { "Évaluation" },
                  color = tintedText,
                  fontSize = 12.sp,
                  fontWeight = FontWeight.SemiBold,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
              }
              Text(
                text = "${grade.score}${grade.outOf}",
                color = tintedText,
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold
              )
            }
          }
        }
      }
      item { Spacer(modifier = Modifier.height(14.dp)) }
    }
  }
}

@Composable
private fun CanteenScreen(
  snapshot: WearSnapshot?,
  accentColor: Color,
  gradientStops: List<Color>,
  onOpenQr: (Int) -> Unit
) {
  val listState = rememberScalingLazyListState()
  val cards = snapshot?.canteenCards.orEmpty()

  WearScreenContainer(gradientStops = gradientStops, listState = listState) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 8.dp),
      verticalArrangement = Arrangement.spacedBy(6.dp),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item {
        ScreenHeader(title = "Cantine", accentColor = accentColor)
      }
      if (cards.isEmpty()) {
        item { EmptyCard("Aucune carte cantine") }
      } else {
        itemsIndexed(cards) { index, card ->
          Chip(
            onClick = { onOpenQr(index) },
            modifier = Modifier.fillMaxWidth(),
            colors = ChipDefaults.secondaryChipColors(
              backgroundColor = CardDark.copy(alpha = 0.92f),
              contentColor = Color.White
            ),
            label = {
              Text(text = card.label, fontWeight = FontWeight.SemiBold, maxLines = 1)
            },
            secondaryLabel = {
              Text(
                text = if (!card.qrData.isNullOrBlank()) "${card.balanceText} • Voir QR" else card.balanceText,
                color = accentColor,
                maxLines = 1
              )
            }
          )
        }
      }
      item { Spacer(modifier = Modifier.height(14.dp)) }
    }
  }
}

@Composable
private fun CanteenQrScreen(
  card: WearCanteenCard?,
  accentColor: Color,
  gradientStops: List<Color>
) {
  val bitmap: Bitmap? = remember(card?.qrData, card?.qrType) {
    val data = card?.qrData ?: return@remember null
    QrCodeGenerator.generate(data, card.qrType, 320)
  }

  WearScreenContainer(gradientStops = gradientStops) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(16.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      if (card == null || bitmap == null) {
        EmptyCard("QR code indisponible")
      } else {
        Text(
          text = card.label,
          color = Color.White,
          fontSize = 12.sp,
          fontWeight = FontWeight.SemiBold,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis
        )
        Spacer(modifier = Modifier.height(6.dp))
        Box(
          modifier = Modifier
            .size(124.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White)
            .padding(6.dp),
          contentAlignment = Alignment.Center
        ) {
          Image(
            bitmap = bitmap.asImageBitmap(),
            contentDescription = card.label,
            modifier = Modifier.fillMaxSize()
          )
        }
        Spacer(modifier = Modifier.height(4.dp))
        Text(
          text = card.balanceText,
          color = accentColor,
          fontSize = 12.sp,
          fontWeight = FontWeight.Bold
        )
      }
    }
  }
}

@Composable
private fun CustomizeScreen(
  snapshot: WearSnapshot?,
  prefs: WearLocalPreferences,
  accentColor: Color,
  brightAccent: Color,
  gradientStops: List<Color>,
  onToggleGradient: (Boolean) -> Unit,
  onToggleSection: (String, Boolean) -> Unit,
  onSelectComplicationMetric: (String) -> Unit,
  onSelectTilePreset: (String) -> Unit,
  onResetPhoneConfig: () -> Unit
) {
  val listState = rememberScalingLazyListState()
  val activeSyncGradient = snapshot?.effectiveSyncGradient(prefs) ?: prefs.syncThemeGradient
  val activeSections = snapshot?.effectiveSections(prefs) ?: prefs.enabledSections
  val activeMetric = snapshot?.effectiveComplicationMetric(prefs) ?: prefs.complicationMetric
  val activeTilePreset = snapshot?.effectiveTilePreset(prefs) ?: prefs.tilePreset

  val toggleColors = ToggleChipDefaults.toggleChipColors(
    checkedStartBackgroundColor = accentColor.copy(alpha = 0.28f),
    checkedEndBackgroundColor = CardDark,
    uncheckedStartBackgroundColor = CardDark,
    uncheckedEndBackgroundColor = CardDark
  )
  val switchColors = SwitchDefaults.colors(
    checkedThumbColor = brightAccent,
    checkedTrackColor = accentColor.copy(alpha = 0.36f),
    uncheckedThumbColor = Color(0xFFB4B4BC),
    uncheckedTrackColor = CardDarkElevated
  )

  WearScreenContainer(gradientStops = gradientStops, listState = listState) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 8.dp),
      verticalArrangement = Arrangement.spacedBy(6.dp),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item {
        ScreenHeader(title = "Personnaliser", accentColor = brightAccent)
      }

      item {
        ToggleChip(
          checked = activeSyncGradient,
          onCheckedChange = onToggleGradient,
          modifier = Modifier.fillMaxWidth(),
          colors = toggleColors,
          label = { Text("Sync thème & dégradé", fontSize = 12.sp, maxLines = 1) },
          toggleControl = { Switch(checked = activeSyncGradient, colors = switchColors) }
        )
      }

      val sectionLabels = listOf(
        "classes" to "Emploi du temps",
        "tasks" to "Devoirs",
        "grades" to "Notes",
        "canteen" to "Cartes cantine"
      )
      items(sectionLabels) { (id, title) ->
        val checked = id in activeSections
        ToggleChip(
          checked = checked,
          onCheckedChange = { onToggleSection(id, it) },
          modifier = Modifier.fillMaxWidth(),
          colors = toggleColors,
          label = { Text(title, fontSize = 12.sp, maxLines = 1) },
          toggleControl = { Switch(checked = checked, colors = switchColors) }
        )
      }

      item {
        Text(
          text = "Tile / Widget Montre",
          color = brightAccent,
          fontSize = 11.sp,
          fontWeight = FontWeight.Bold,
          modifier = Modifier.padding(top = 4.dp)
        )
      }

      val tilePresets = listOf(
        "next_2_classes" to "2 prochains cours",
        "next_class_countdown" to "1 cours + compte à rebours",
        "homework" to "Devoirs à faire",
        "grade_average" to "Moyenne générale",
        "latest_grades" to "Dernières notes",
        "overview" to "Résumé mixte"
      )
      items(tilePresets) { (presetId, presetLabel) ->
        val selected = activeTilePreset == presetId
        Chip(
          onClick = { onSelectTilePreset(presetId) },
          modifier = Modifier.fillMaxWidth(),
          colors = ChipDefaults.secondaryChipColors(
            backgroundColor = if (selected) accentColor.copy(alpha = 0.28f) else CardDark,
            contentColor = Color.White
          ),
          label = {
            Text(
              text = if (selected) "● $presetLabel" else "○ $presetLabel",
              fontSize = 12.sp,
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
          }
        )
      }

      item {
        Text(
          text = "Complication du cadran",
          color = brightAccent,
          fontSize = 11.sp,
          fontWeight = FontWeight.Bold,
          modifier = Modifier.padding(top = 4.dp)
        )
      }

      val metrics = listOf(
        "next_class" to "Prochain cours",
        "next_class_countdown" to "Compte à rebours",
        "tasks_count" to "Devoirs restants",
        "overall_average" to "Moyenne générale",
        "latest_grade" to "Dernière note"
      )
      items(metrics) { (metricId, metricLabel) ->
        val selected = activeMetric == metricId
        Chip(
          onClick = { onSelectComplicationMetric(metricId) },
          modifier = Modifier.fillMaxWidth(),
          colors = ChipDefaults.secondaryChipColors(
            backgroundColor = if (selected) accentColor.copy(alpha = 0.28f) else CardDark,
            contentColor = Color.White
          ),
          label = {
            Text(
              text = if (selected) "● $metricLabel" else "○ $metricLabel",
              fontSize = 12.sp,
              maxLines = 1
            )
          }
        )
      }

      if (prefs.useCustomOverride) {
        item {
          Chip(
            onClick = onResetPhoneConfig,
            modifier = Modifier.fillMaxWidth(),
            colors = ChipDefaults.secondaryChipColors(
              backgroundColor = CardDarkElevated,
              contentColor = Color.White
            ),
            label = {
              Text(
                text = "Suivre le téléphone",
                fontSize = 12.sp,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
              )
            }
          )
        }
      }

      item { Spacer(modifier = Modifier.height(14.dp)) }
    }
  }
}

@Composable
private fun ShareQrScreen(
  accentColor: Color,
  gradientStops: List<Color>
) {
  val qrBitmap = remember {
    QrCodeGenerator.generate(WearSnapshot.RELEASE_PAGE_URL, "qrcode", 320)
  }

  WearScreenContainer(gradientStops = gradientStops) {
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(14.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.Center
    ) {
      Text(
        text = "Partager Papillon +",
        color = accentColor,
        fontSize = 12.sp,
        fontWeight = FontWeight.Bold
      )
      Spacer(modifier = Modifier.height(6.dp))
      if (qrBitmap != null) {
        Box(
          modifier = Modifier
            .size(116.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(Color.White)
            .padding(6.dp),
          contentAlignment = Alignment.Center
        ) {
          Image(
            bitmap = qrBitmap.asImageBitmap(),
            contentDescription = "QR Papillon +",
            modifier = Modifier.fillMaxSize()
          )
        }
      } else {
        EmptyCard("QR indisponible")
      }
      Spacer(modifier = Modifier.height(4.dp))
      Text(
        text = "timpim-dev/Papillon-beta",
        color = TextSecondaryDark,
        fontSize = 10.sp
      )
    }
  }
}

@Composable
private fun ScreenHeader(title: String, accentColor: Color) {
  Spacer(modifier = Modifier.height(8.dp))
  Text(
    text = title,
    color = accentColor,
    fontSize = 14.sp,
    fontWeight = FontWeight.Bold,
    textAlign = TextAlign.Center
  )
}

@Composable
private fun EmptyCard(message: String) {
  Box(
    modifier = Modifier
      .fillMaxWidth()
      .clip(RoundedCornerShape(16.dp))
      .background(CardDark.copy(alpha = 0.90f))
      .padding(12.dp),
    contentAlignment = Alignment.Center
  ) {
    Text(
      text = message,
      color = Color.White.copy(alpha = 0.78f),
      fontSize = 12.sp,
      textAlign = TextAlign.Center
    )
  }
}

private fun encodeId(raw: String): String {
  return Base64.encodeToString(
    raw.toByteArray(Charsets.UTF_8),
    Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING
  )
}

private fun decodeId(encoded: String): String {
  return try {
    String(
      Base64.decode(encoded, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING),
      Charsets.UTF_8
    )
  } catch (_: Throwable) {
    ""
  }
}
