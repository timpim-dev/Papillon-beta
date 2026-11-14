package xyz.getpapillon.wear.ui

import android.graphics.Bitmap
import android.util.Base64
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
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
import xyz.getpapillon.wear.WearFormatters
import xyz.getpapillon.wear.WearLocalPreferences
import xyz.getpapillon.wear.WearRepository
import xyz.getpapillon.wear.WearSnapshot
import xyz.getpapillon.wear.WearTask

private val DefaultAccent = Color(0xFF6D8BFF)
private val DefaultSecondary = Color(0xFF4AD991)
private val SurfaceDark = Color(0xFF171A21)

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
          parsed[0].copy(alpha = 0.44f),
          parsed[1].copy(alpha = 0.18f),
          Color.Black
        )
        parsed.size == 1 -> listOf(
          parsed[0].copy(alpha = 0.42f),
          Color.Black
        )
        else -> listOf(
          accentColor.copy(alpha = 0.34f),
          Color.Black
        )
      }
    }
  }

  val colors = Colors(
    primary = accentColor,
    primaryVariant = accentColor.copy(alpha = 0.78f),
    secondary = DefaultSecondary,
    secondaryVariant = DefaultSecondary.copy(alpha = 0.78f),
    background = Color.Black,
    surface = SurfaceDark,
    error = Color(0xFFFF6B6B),
    onPrimary = Color.Black,
    onSecondary = Color.Black,
    onBackground = Color.White,
    onSurface = Color.White,
    onSurfaceVariant = Color(0xFFB4B9C6),
    onError = Color.Black
  )

  MaterialTheme(colors = colors) {
    val navController = rememberSwipeDismissableNavController()
    Box(
      modifier = Modifier
        .fillMaxSize()
        .background(Brush.verticalGradient(gradientStops))
    ) {
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
            hasPendingUpdate = pendingApkPath != null,
            onNavigate = { route -> navController.navigate(route) },
            onSync = { WearRepository.requestPhoneSync(context) },
            onInstallUpdate = { WearRepository.installPendingApkUpdate(context) }
          )
        }
        composable("classes") {
          TimetableScreen(snapshot = snapshot, accentColor = accentColor)
        }
        composable("tasks") {
          TasksScreen(
            snapshot = snapshot,
            accentColor = accentColor,
            onOpenTask = { task ->
              navController.navigate("task_detail/${encodeId(task.id)}")
            }
          )
        }
        composable("task_detail/{taskKey}") { entry ->
          val key = entry.arguments?.getString("taskKey") ?: ""
          val taskId = decodeId(key)
          val task = snapshot?.tasks?.firstOrNull { it.id == taskId }
          TaskDetailScreen(
            task = task,
            accentColor = accentColor,
            onToggleDone = { current ->
              WearRepository.toggleTaskDone(context, current.id, !current.isDone)
            }
          )
        }
        composable("grades") {
          GradesScreen(snapshot = snapshot, accentColor = accentColor)
        }
        composable("canteen") {
          CanteenScreen(
            snapshot = snapshot,
            accentColor = accentColor,
            onOpenQr = { index -> navController.navigate("canteen_qr/$index") }
          )
        }
        composable("canteen_qr/{index}") { entry ->
          val idx = entry.arguments?.getString("index")?.toIntOrNull() ?: 0
          val card = snapshot?.canteenCards?.getOrNull(idx)
          CanteenQrScreen(card = card)
        }
        composable("customize") {
          CustomizeScreen(
            snapshot = snapshot,
            prefs = localPrefs,
            accentColor = accentColor,
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
            onResetPhoneConfig = {
              WearRepository.resetToPhoneConfig(context)
            }
          )
        }
        composable("share") {
          ShareQrScreen(accentColor = accentColor)
        }
      }
    }
  }
}

@Composable
private fun HomeScreen(
  snapshot: WearSnapshot?,
  prefs: WearLocalPreferences,
  isSyncing: Boolean,
  accentColor: Color,
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

  Scaffold(
    timeText = { TimeText() },
    vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
  ) {
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
            color = accentColor,
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
              backgroundColor = accentColor,
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
          Box(
            modifier = Modifier
              .fillMaxWidth()
              .clip(RoundedCornerShape(16.dp))
              .background(SurfaceDark.copy(alpha = 0.85f))
              .padding(12.dp)
          ) {
            Text(
              text = "Ouvre Papillon + sur ton téléphone pour synchroniser",
              color = Color.White.copy(alpha = 0.82f),
              fontSize = 12.sp,
              textAlign = TextAlign.Center
            )
          }
        }
      }

      items(enabledSections) { sectionId ->
        when (sectionId) {
          "classes" -> HomeMenuChip(
            title = "Emploi du temps",
            subtitle = snapshot?.nextClasses?.firstOrNull()?.let {
              "${it.emoji ?: "📚"} ${it.subject} • ${WearFormatters.formatHour(it.from)}"
            } ?: "$nextClassesCount cours",
            badgeEmoji = "📅",
            accentColor = accentColor,
            onClick = { onNavigate("classes") }
          )
          "tasks" -> HomeMenuChip(
            title = "Devoirs",
            subtitle = if (pendingTasksCount == 0) {
              "Tout est à jour"
            } else {
              "$pendingTasksCount à faire"
            },
            badgeEmoji = "✅",
            accentColor = accentColor,
            onClick = { onNavigate("tasks") }
          )
          "grades" -> HomeMenuChip(
            title = "Notes",
            subtitle = snapshot?.latestGrades?.firstOrNull()?.let {
              "${it.subject} : ${it.score}${it.outOf}"
            } ?: "$gradesCount notes",
            badgeEmoji = "📊",
            accentColor = accentColor,
            onClick = { onNavigate("grades") }
          )
          "canteen" -> HomeMenuChip(
            title = "Cartes cantine",
            subtitle = snapshot?.canteenCards?.firstOrNull()?.balanceText
              ?: "$cardsCount carte(s)",
            badgeEmoji = "🍽️",
            accentColor = accentColor,
            onClick = { onNavigate("canteen") }
          )
        }
      }

      item {
        HomeMenuChip(
          title = "Personnaliser",
          subtitle = "Sections, thème & cadran",
          badgeEmoji = "🎨",
          accentColor = accentColor,
          onClick = { onNavigate("customize") }
        )
      }

      item {
        HomeMenuChip(
          title = "Partager Papillon +",
          subtitle = "QR code téléchargement",
          badgeEmoji = "📲",
          accentColor = accentColor,
          onClick = { onNavigate("share") }
        )
      }

      item {
        Chip(
          onClick = onSync,
          modifier = Modifier.fillMaxWidth(),
          colors = ChipDefaults.secondaryChipColors(
            backgroundColor = accentColor.copy(alpha = 0.22f),
            contentColor = Color.White
          ),
          label = {
            Row(verticalAlignment = Alignment.CenterVertically) {
              if (isSyncing) {
                CircularProgressIndicator(
                  modifier = Modifier.size(16.dp),
                  strokeWidth = 2.dp,
                  indicatorColor = accentColor
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
      backgroundColor = SurfaceDark.copy(alpha = 0.9f),
      contentColor = Color.White,
      secondaryContentColor = Color.White.copy(alpha = 0.72f)
    ),
    icon = {
      Box(
        modifier = Modifier
          .size(28.dp)
          .clip(CircleShape)
          .background(accentColor.copy(alpha = 0.22f)),
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
private fun TimetableScreen(snapshot: WearSnapshot?, accentColor: Color) {
  val listState = rememberScalingLazyListState()
  val courses = snapshot?.nextClasses.orEmpty()

  Scaffold(
    timeText = { TimeText() },
    vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
  ) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 8.dp),
      verticalArrangement = Arrangement.spacedBy(6.dp),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item {
        ScreenHeader(title = "Emploi du temps", accentColor = accentColor)
      }
      if (courses.isEmpty()) {
        item { EmptyCard("Aucun cours à venir") }
      } else {
        items(courses, key = { it.id }) { course ->
          val courseAccent = Color(WearFormatters.parseColorInt(course.color, accentColor.toArgb()))
          Box(
            modifier = Modifier
              .fillMaxWidth()
              .clip(RoundedCornerShape(16.dp))
              .background(courseAccent.copy(alpha = 0.16f))
              .border(1.dp, courseAccent.copy(alpha = 0.35f), RoundedCornerShape(16.dp))
              .padding(10.dp)
          ) {
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
              Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
              ) {
                Text(
                  text = "${course.emoji ?: "📚"} ${course.subject}",
                  color = Color.White,
                  fontSize = 13.sp,
                  fontWeight = FontWeight.SemiBold,
                  textDecoration = if (course.isCanceled) TextDecoration.LineThrough else null,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis,
                  modifier = Modifier.weight(1f)
                )
              }
              val timeStr = WearFormatters.formatTimeRange(course.from, course.to)
              val roomPart = course.room?.takeIf { it.isNotBlank() }?.let { " • $it" } ?: ""
              Text(
                text = if (course.isCanceled) "Annulé • $timeStr" else "$timeStr$roomPart",
                color = if (course.isCanceled) Color(0xFFFF7B7B) else courseAccent,
                fontSize = 11.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
              )
              course.teacher?.takeIf { it.isNotBlank() }?.let { teacher ->
                Text(
                  text = teacher,
                  color = Color.White.copy(alpha = 0.65f),
                  fontSize = 10.sp,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
              }
            }
          }
        }
      }
      item { Spacer(modifier = Modifier.height(14.dp)) }
    }
  }
}

@Composable
private fun TasksScreen(
  snapshot: WearSnapshot?,
  accentColor: Color,
  onOpenTask: (WearTask) -> Unit
) {
  val listState = rememberScalingLazyListState()
  val tasks = snapshot?.tasks.orEmpty()

  Scaffold(
    timeText = { TimeText() },
    vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
  ) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 8.dp),
      verticalArrangement = Arrangement.spacedBy(6.dp),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item {
        ScreenHeader(title = "Devoirs", accentColor = accentColor)
      }
      if (tasks.isEmpty()) {
        item { EmptyCard("Aucun devoir à faire") }
      } else {
        items(tasks, key = { it.id }) { task ->
          val taskAccent = Color(WearFormatters.parseColorInt(task.color, accentColor.toArgb()))
          Chip(
            onClick = { onOpenTask(task) },
            modifier = Modifier.fillMaxWidth(),
            colors = ChipDefaults.secondaryChipColors(
              backgroundColor = taskAccent.copy(alpha = if (task.isDone) 0.08f else 0.18f),
              contentColor = Color.White,
              secondaryContentColor = Color.White.copy(alpha = 0.72f)
            ),
            icon = {
              Box(
                modifier = Modifier
                  .size(26.dp)
                  .clip(CircleShape)
                  .background(
                    if (task.isDone) DefaultSecondary.copy(alpha = 0.25f)
                    else taskAccent.copy(alpha = 0.28f)
                  ),
                contentAlignment = Alignment.Center
              ) {
                Text(
                  text = if (task.isDone) "✓" else (task.emoji ?: "📝"),
                  color = if (task.isDone) DefaultSecondary else Color.White,
                  fontSize = 12.sp,
                  fontWeight = FontWeight.Bold
                )
              }
            },
            label = {
              Text(
                text = task.subject,
                fontWeight = FontWeight.SemiBold,
                textDecoration = if (task.isDone) TextDecoration.LineThrough else null,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
              )
            },
            secondaryLabel = {
              val date = WearFormatters.formatShortDate(task.dueDate)
              val preview = task.description.ifBlank { date }
              Text(
                text = if (date.isNotBlank() && task.description.isNotBlank()) "$date • $preview" else preview,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
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
private fun TaskDetailScreen(
  task: WearTask?,
  accentColor: Color,
  onToggleDone: (WearTask) -> Unit
) {
  val listState = rememberScalingLazyListState()

  Scaffold(
    timeText = { TimeText() },
    vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
  ) {
    if (task == null) {
      Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        EmptyCard("Devoir introuvable")
      }
      return@Scaffold
    }

    val taskAccent = Color(WearFormatters.parseColorInt(task.color, accentColor.toArgb()))
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
          text = "${task.emoji ?: "📝"} ${task.subject}",
          color = taskAccent,
          fontSize = 14.sp,
          fontWeight = FontWeight.Bold,
          textAlign = TextAlign.Center
        )
        val dateText = WearFormatters.formatFullDateTime(task.dueDate)
        if (dateText.isNotEmpty()) {
          Text(
            text = "Pour $dateText",
            color = Color.White.copy(alpha = 0.72f),
            fontSize = 11.sp,
            textAlign = TextAlign.Center
          )
        }
      }

      item {
        Box(
          modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .background(SurfaceDark.copy(alpha = 0.9f))
            .border(1.dp, taskAccent.copy(alpha = 0.35f), RoundedCornerShape(16.dp))
            .padding(10.dp)
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
            backgroundColor = if (task.isDone) Color(0xFF2D3342) else DefaultSecondary,
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
private fun GradesScreen(snapshot: WearSnapshot?, accentColor: Color) {
  val listState = rememberScalingLazyListState()
  val grades = snapshot?.latestGrades.orEmpty()

  Scaffold(
    timeText = { TimeText() },
    vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
  ) {
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
              .clip(RoundedCornerShape(14.dp))
              .background(accentColor.copy(alpha = 0.2f))
              .border(1.dp, accentColor.copy(alpha = 0.4f), RoundedCornerShape(14.dp))
              .padding(10.dp),
            contentAlignment = Alignment.Center
          ) {
            Text(
              text = "Moyenne générale : $avg",
              color = Color.White,
              fontSize = 13.sp,
              fontWeight = FontWeight.Bold
            )
          }
        }
      }
      if (grades.isEmpty()) {
        item { EmptyCard("Aucune note récente") }
      } else {
        items(grades, key = { it.id }) { grade ->
          val gradeAccent = Color(WearFormatters.parseColorInt(grade.color, accentColor.toArgb()))
          Box(
            modifier = Modifier
              .fillMaxWidth()
              .clip(RoundedCornerShape(16.dp))
              .background(gradeAccent.copy(alpha = 0.16f))
              .border(1.dp, gradeAccent.copy(alpha = 0.32f), RoundedCornerShape(16.dp))
              .padding(10.dp)
          ) {
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Column(modifier = Modifier.weight(1f).padding(end = 6.dp)) {
                Text(
                  text = "${grade.emoji ?: "📊"} ${grade.subject}",
                  color = Color.White,
                  fontSize = 12.sp,
                  fontWeight = FontWeight.SemiBold,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
                Text(
                  text = grade.description.ifBlank { WearFormatters.formatShortDate(grade.date) },
                  color = Color.White.copy(alpha = 0.7f),
                  fontSize = 10.sp,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
              }
              Text(
                text = "${grade.score}${grade.outOf}",
                color = gradeAccent,
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
  onOpenQr: (Int) -> Unit
) {
  val listState = rememberScalingLazyListState()
  val cards = snapshot?.canteenCards.orEmpty()

  Scaffold(
    timeText = { TimeText() },
    vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
  ) {
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
              backgroundColor = SurfaceDark.copy(alpha = 0.9f),
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
private fun CanteenQrScreen(card: WearCanteenCard?) {
  val bitmap: Bitmap? = remember(card?.qrData, card?.qrType) {
    val data = card?.qrData ?: return@remember null
    QrCodeGenerator.generate(data, card.qrType, 320)
  }

  Scaffold(timeText = { TimeText() }) {
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
          color = DefaultSecondary,
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
  onToggleGradient: (Boolean) -> Unit,
  onToggleSection: (String, Boolean) -> Unit,
  onSelectComplicationMetric: (String) -> Unit,
  onResetPhoneConfig: () -> Unit
) {
  val listState = rememberScalingLazyListState()
  val activeSyncGradient = snapshot?.effectiveSyncGradient(prefs) ?: prefs.syncThemeGradient
  val activeSections = snapshot?.effectiveSections(prefs) ?: prefs.enabledSections
  val activeMetric = snapshot?.effectiveComplicationMetric(prefs) ?: prefs.complicationMetric

  Scaffold(
    timeText = { TimeText() },
    vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
  ) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier
        .fillMaxSize()
        .padding(horizontal = 8.dp),
      verticalArrangement = Arrangement.spacedBy(6.dp),
      horizontalAlignment = Alignment.CenterHorizontally
    ) {
      item {
        ScreenHeader(title = "Personnaliser", accentColor = accentColor)
      }

      item {
        ToggleChip(
          checked = activeSyncGradient,
          onCheckedChange = onToggleGradient,
          modifier = Modifier.fillMaxWidth(),
          colors = ToggleChipDefaults.toggleChipColors(
            checkedStartBackgroundColor = accentColor.copy(alpha = 0.3f),
            checkedEndBackgroundColor = SurfaceDark,
            uncheckedStartBackgroundColor = SurfaceDark,
            uncheckedEndBackgroundColor = SurfaceDark
          ),
          label = { Text("Sync thème & dégradé", fontSize = 12.sp, maxLines = 1) },
          toggleControl = { Switch(checked = activeSyncGradient) }
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
          label = { Text(title, fontSize = 12.sp, maxLines = 1) },
          toggleControl = { Switch(checked = checked) }
        )
      }

      item {
        Text(
          text = "Complication du cadran",
          color = accentColor,
          fontSize = 11.sp,
          fontWeight = FontWeight.Bold,
          modifier = Modifier.padding(top = 4.dp)
        )
      }

      val metrics = listOf(
        "next_class" to "Prochain cours",
        "tasks_count" to "Devoirs restants",
        "overall_average" to "Moyenne générale"
      )
      items(metrics) { (metricId, metricLabel) ->
        val selected = activeMetric == metricId
        Chip(
          onClick = { onSelectComplicationMetric(metricId) },
          modifier = Modifier.fillMaxWidth(),
          colors = ChipDefaults.secondaryChipColors(
            backgroundColor = if (selected) accentColor.copy(alpha = 0.28f) else SurfaceDark,
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
              backgroundColor = Color(0xFF282C38),
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
private fun ShareQrScreen(accentColor: Color) {
  val qrBitmap = remember {
    QrCodeGenerator.generate(WearSnapshot.RELEASE_PAGE_URL, "qrcode", 320)
  }

  Scaffold(timeText = { TimeText() }) {
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
        color = Color.White.copy(alpha = 0.72f),
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
      .background(SurfaceDark.copy(alpha = 0.85f))
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
