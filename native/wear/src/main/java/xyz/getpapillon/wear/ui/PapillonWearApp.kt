package xyz.getpapillon.wear.ui

import android.app.Activity
import android.net.Uri
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
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
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Card
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.Colors
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.PositionIndicator
import androidx.wear.compose.material.Scaffold
import androidx.wear.compose.material.Text
import androidx.wear.compose.material.TimeText
import androidx.wear.compose.material.Vignette
import androidx.wear.compose.material.VignettePosition
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import xyz.getpapillon.wear.QrCodeGenerator
import xyz.getpapillon.wear.R
import xyz.getpapillon.wear.WearCanteenCard
import xyz.getpapillon.wear.WearRepository
import xyz.getpapillon.wear.WearSnapshot
import xyz.getpapillon.wear.formatWearDueDate
import xyz.getpapillon.wear.formatWearShortDate
import xyz.getpapillon.wear.formatWearTimeRange
import xyz.getpapillon.wear.parseComposeColor

private val PapillonColors = Colors(
  primary = Color(0xFF29947A),
  primaryVariant = Color(0xFF1F745F),
  secondary = Color(0xFF4DC4A6),
  secondaryVariant = Color(0xFF29947A),
  background = Color.Black,
  surface = Color(0xFF1B1E23),
  onPrimary = Color.White,
  onSecondary = Color.Black,
  onBackground = Color.White,
  onSurface = Color.White,
  onSurfaceVariant = Color(0xFF9CA3AF),
)

@Composable
fun PapillonWearApp() {
  MaterialTheme(colors = PapillonColors) {
    val navController = rememberSwipeDismissableNavController()
    val snapshot by WearRepository.snapshot.collectAsState()
    val context = LocalContext.current

    SwipeDismissableNavHost(
      navController = navController,
      startDestination = "home"
    ) {
      composable("home") {
        WearHomeScreen(
          snapshot = snapshot,
          onOpenTimetable = { navController.navigate("timetable") },
          onOpenTasks = { navController.navigate("tasks") },
          onOpenGrades = { navController.navigate("grades") },
          onOpenCanteen = { navController.navigate("canteen") },
          onRequestSync = { WearRepository.requestSyncFromPhone(context) }
        )
      }

      composable("timetable") {
        WearTimetableScreen(snapshot = snapshot)
      }

      composable("tasks") {
        WearTasksScreen(snapshot = snapshot)
      }

      composable("grades") {
        WearGradesScreen(snapshot = snapshot)
      }

      composable("canteen") {
        WearCanteenListScreen(
          cards = snapshot.canteenCards,
          onSelectCard = { card ->
            navController.navigate("canteen_qr/${Uri.encode(card.id)}")
          }
        )
      }

      composable("canteen_qr/{cardId}") { backStackEntry ->
        val encodedId = backStackEntry.arguments?.getString("cardId") ?: ""
        val cardId = Uri.decode(encodedId)
        val card = snapshot.canteenCards.find { it.id == cardId }
        WearCanteenQrScreen(card = card)
      }
    }
  }
}

@Composable
private fun WearHomeScreen(
  snapshot: WearSnapshot,
  onOpenTimetable: () -> Unit,
  onOpenTasks: () -> Unit,
  onOpenGrades: () -> Unit,
  onOpenCanteen: () -> Unit,
  onRequestSync: () -> Unit,
) {
  val listState = rememberScalingLazyListState()
  val now = System.currentTimeMillis()
  val nextCourse = snapshot.nextClasses.firstOrNull { it.to > now }
  val pendingTasksCount = snapshot.tasks.count { !it.isDone }

  Scaffold(
    timeText = { TimeText() },
    vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
  ) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier.fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
      item {
        Text(
          text = snapshot.accountName ?: "Papillon",
          style = MaterialTheme.typography.title3,
          color = MaterialTheme.colors.primary,
          maxLines = 1,
          overflow = TextOverflow.Ellipsis,
          textAlign = TextAlign.Center,
          modifier = Modifier.fillMaxWidth()
        )
      }

      item {
        if (nextCourse != null) {
          Card(
            onClick = onOpenTimetable,
            modifier = Modifier.fillMaxWidth()
          ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
              Box(
                modifier = Modifier
                  .width(4.dp)
                  .height(30.dp)
                  .clip(RoundedCornerShape(2.dp))
                  .background(parseComposeColor(nextCourse.color))
              )
              Spacer(modifier = Modifier.width(8.dp))
              Column(modifier = Modifier.weight(1f)) {
                Text(
                  text = nextCourse.subject,
                  fontWeight = FontWeight.Bold,
                  fontSize = 13.sp,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
                Text(
                  text = formatWearTimeRange(nextCourse.from, nextCourse.to) +
                    (nextCourse.room?.let { " · $it" } ?: ""),
                  fontSize = 11.sp,
                  color = MaterialTheme.colors.onSurfaceVariant,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
              }
            }
          }
        } else {
          Card(
            onClick = onRequestSync,
            modifier = Modifier.fillMaxWidth()
          ) {
            Text(
              text = if (snapshot.updatedAt == 0L) {
                stringResource(R.string.wear_no_sync_yet)
              } else {
                stringResource(R.string.wear_empty_timetable)
              },
              fontSize = 12.sp,
              color = MaterialTheme.colors.onSurfaceVariant,
              textAlign = TextAlign.Center,
              modifier = Modifier.fillMaxWidth()
            )
          }
        }
      }

      item {
        Chip(
          onClick = onOpenTimetable,
          label = { Text(stringResource(R.string.wear_home_timetable), maxLines = 1) },
          secondaryLabel = { Text("${snapshot.nextClasses.count { it.to > now }} à venir") },
          colors = ChipDefaults.secondaryChipColors(),
          modifier = Modifier.fillMaxWidth()
        )
      }

      item {
        Chip(
          onClick = onOpenTasks,
          label = { Text(stringResource(R.string.wear_home_tasks), maxLines = 1) },
          secondaryLabel = { Text("$pendingTasksCount à faire") },
          colors = ChipDefaults.secondaryChipColors(),
          modifier = Modifier.fillMaxWidth()
        )
      }

      item {
        Chip(
          onClick = onOpenGrades,
          label = { Text(stringResource(R.string.wear_home_grades), maxLines = 1) },
          secondaryLabel = {
            Text(snapshot.overallAverage?.let { "Moy. $it" } ?: "${snapshot.latestGrades.size} récentes")
          },
          colors = ChipDefaults.secondaryChipColors(),
          modifier = Modifier.fillMaxWidth()
        )
      }

      item {
        Chip(
          onClick = onOpenCanteen,
          label = { Text(stringResource(R.string.wear_home_canteen), maxLines = 1) },
          secondaryLabel = { Text("${snapshot.canteenCards.size} carte(s)") },
          colors = ChipDefaults.secondaryChipColors(),
          modifier = Modifier.fillMaxWidth()
        )
      }

      item {
        Chip(
          onClick = onRequestSync,
          label = {
            Text(
              text = stringResource(R.string.wear_home_sync),
              textAlign = TextAlign.Center,
              modifier = Modifier.fillMaxWidth()
            )
          },
          colors = ChipDefaults.primaryChipColors(),
          modifier = Modifier.fillMaxWidth()
        )
      }
    }
  }
}

@Composable
private fun WearTimetableScreen(snapshot: WearSnapshot) {
  val listState = rememberScalingLazyListState()
  val now = System.currentTimeMillis()
  val courses = snapshot.nextClasses.filter { it.to > now }

  Scaffold(
    timeText = { TimeText() },
    vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
  ) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier.fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
      item {
        Text(
          text = stringResource(R.string.wear_home_timetable),
          style = MaterialTheme.typography.title3,
          textAlign = TextAlign.Center,
          modifier = Modifier.fillMaxWidth()
        )
      }

      if (courses.isEmpty()) {
        item {
          Text(
            text = stringResource(R.string.wear_empty_timetable),
            color = MaterialTheme.colors.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier
              .fillMaxWidth()
              .padding(top = 12.dp)
          )
        }
      } else {
        items(courses) { course ->
          Card(
            onClick = {},
            modifier = Modifier.fillMaxWidth()
          ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
              Box(
                modifier = Modifier
                  .width(4.dp)
                  .height(34.dp)
                  .clip(RoundedCornerShape(2.dp))
                  .background(parseComposeColor(course.color))
              )
              Spacer(modifier = Modifier.width(8.dp))
              Column {
                Text(
                  text = if (course.isCanceled) "${course.subject} (Annulé)" else course.subject,
                  fontWeight = FontWeight.Bold,
                  fontSize = 13.sp,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
                Text(
                  text = formatWearTimeRange(course.from, course.to),
                  fontSize = 12.sp,
                  color = MaterialTheme.colors.secondary
                )
                val detail = listOfNotNull(course.room?.let { "Salle $it" }, course.teacher)
                  .joinToString(" · ")
                if (detail.isNotEmpty()) {
                  Text(
                    text = detail,
                    fontSize = 11.sp,
                    color = MaterialTheme.colors.onSurfaceVariant,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                  )
                }
              }
            }
          }
        }
      }
    }
  }
}

@Composable
private fun WearTasksScreen(snapshot: WearSnapshot) {
  val listState = rememberScalingLazyListState()
  val tasks = snapshot.tasks.filter { !it.isDone }

  Scaffold(
    timeText = { TimeText() },
    vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
  ) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier.fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
      item {
        Text(
          text = stringResource(R.string.wear_home_tasks),
          style = MaterialTheme.typography.title3,
          textAlign = TextAlign.Center,
          modifier = Modifier.fillMaxWidth()
        )
      }

      if (tasks.isEmpty()) {
        item {
          Text(
            text = stringResource(R.string.wear_empty_tasks),
            color = MaterialTheme.colors.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier
              .fillMaxWidth()
              .padding(top = 12.dp)
          )
        }
      } else {
        items(tasks) { task ->
          Card(
            onClick = {},
            modifier = Modifier.fillMaxWidth()
          ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
              Box(
                modifier = Modifier
                  .size(8.dp)
                  .clip(CircleShape)
                  .background(parseComposeColor(task.color))
              )
              Spacer(modifier = Modifier.width(8.dp))
              Column {
                Text(
                  text = "${task.subject} · ${formatWearDueDate(task.dueDate)}",
                  fontWeight = FontWeight.Bold,
                  fontSize = 12.sp,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
                Text(
                  text = task.description.ifBlank { "Devoir à faire" },
                  fontSize = 12.sp,
                  color = MaterialTheme.colors.onSurfaceVariant,
                  maxLines = 2,
                  overflow = TextOverflow.Ellipsis
                )
              }
            }
          }
        }
      }
    }
  }
}

@Composable
private fun WearGradesScreen(snapshot: WearSnapshot) {
  val listState = rememberScalingLazyListState()

  Scaffold(
    timeText = { TimeText() },
    vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
  ) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier.fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
      item {
        Text(
          text = stringResource(R.string.wear_home_grades),
          style = MaterialTheme.typography.title3,
          textAlign = TextAlign.Center,
          modifier = Modifier.fillMaxWidth()
        )
      }

      snapshot.overallAverage?.let { avg ->
        item {
          Chip(
            onClick = {},
            label = { Text("Moyenne générale", maxLines = 1) },
            secondaryLabel = { Text(avg, fontWeight = FontWeight.Bold) },
            colors = ChipDefaults.primaryChipColors(),
            modifier = Modifier.fillMaxWidth()
          )
        }
      }

      if (snapshot.latestGrades.isEmpty()) {
        item {
          Text(
            text = stringResource(R.string.wear_empty_grades),
            color = MaterialTheme.colors.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier
              .fillMaxWidth()
              .padding(top = 12.dp)
          )
        }
      } else {
        items(snapshot.latestGrades) { grade ->
          Card(
            onClick = {},
            modifier = Modifier.fillMaxWidth()
          ) {
            Row(
              verticalAlignment = Alignment.CenterVertically,
              modifier = Modifier.fillMaxWidth()
            ) {
              Box(
                modifier = Modifier
                  .width(4.dp)
                  .height(30.dp)
                  .clip(RoundedCornerShape(2.dp))
                  .background(parseComposeColor(grade.color))
              )
              Spacer(modifier = Modifier.width(8.dp))
              Column(modifier = Modifier.weight(1f)) {
                Text(
                  text = grade.subject,
                  fontWeight = FontWeight.Bold,
                  fontSize = 12.sp,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
                Text(
                  text = "${grade.description} · ${formatWearShortDate(grade.date)}",
                  fontSize = 11.sp,
                  color = MaterialTheme.colors.onSurfaceVariant,
                  maxLines = 1,
                  overflow = TextOverflow.Ellipsis
                )
              }
              Spacer(modifier = Modifier.width(6.dp))
              Text(
                text = "${grade.score}${grade.outOf}",
                fontWeight = FontWeight.Bold,
                fontSize = 13.sp,
                color = MaterialTheme.colors.secondary
              )
            }
          }
        }
      }
    }
  }
}

@Composable
private fun WearCanteenListScreen(
  cards: List<WearCanteenCard>,
  onSelectCard: (WearCanteenCard) -> Unit,
) {
  val listState = rememberScalingLazyListState()

  Scaffold(
    timeText = { TimeText() },
    vignette = { Vignette(vignettePosition = VignettePosition.TopAndBottom) },
    positionIndicator = { PositionIndicator(scalingLazyListState = listState) }
  ) {
    ScalingLazyColumn(
      state = listState,
      modifier = Modifier.fillMaxSize(),
      verticalArrangement = Arrangement.spacedBy(6.dp)
    ) {
      item {
        Text(
          text = stringResource(R.string.wear_home_canteen),
          style = MaterialTheme.typography.title3,
          textAlign = TextAlign.Center,
          modifier = Modifier.fillMaxWidth()
        )
      }

      if (cards.isEmpty()) {
        item {
          Text(
            text = stringResource(R.string.wear_empty_canteen),
            color = MaterialTheme.colors.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier
              .fillMaxWidth()
              .padding(top = 12.dp)
          )
        }
      } else {
        items(cards, key = { it.id }) { card ->
          Chip(
            onClick = { onSelectCard(card) },
            label = { Text(card.serviceName, maxLines = 1, overflow = TextOverflow.Ellipsis) },
            secondaryLabel = {
              Text(
                text = listOfNotNull(card.label, card.balanceText).joinToString(" · "),
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
              )
            },
            colors = ChipDefaults.secondaryChipColors(),
            modifier = Modifier.fillMaxWidth()
          )
        }
      }
    }
  }
}

@Composable
private fun WearCanteenQrScreen(card: WearCanteenCard?) {
  val context = LocalContext.current

  DisposableEffect(Unit) {
    val activity = context as? Activity
    val window = activity?.window
    val previousBrightness = window?.attributes?.screenBrightness ?: -1f
    if (window != null) {
      val params = window.attributes
      params.screenBrightness = 1.0f
      window.attributes = params
    }
    onDispose {
      if (window != null) {
        val params = window.attributes
        params.screenBrightness = previousBrightness
        window.attributes = params
      }
    }
  }

  val bitmap = remember(card?.qrData, card?.qrType) {
    card?.qrData?.let { QrCodeGenerator.generate(it, card.qrType) }
  }

  Box(
    contentAlignment = Alignment.Center,
    modifier = Modifier
      .fillMaxSize()
      .background(if (bitmap != null) Color.White else Color.Black)
      .padding(30.dp)
  ) {
    if (bitmap != null) {
      Image(
        bitmap = bitmap.asImageBitmap(),
        contentDescription = card?.label ?: "Canteen QR",
        modifier = Modifier.fillMaxSize()
      )
    } else {
      Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
          text = card?.serviceName ?: "Carte cantine",
          fontWeight = FontWeight.Bold,
          color = Color.White,
          textAlign = TextAlign.Center
        )
        Spacer(modifier = Modifier.height(6.dp))
        Text(
          text = card?.balanceText ?: "QR code indisponible hors ligne",
          fontSize = 12.sp,
          color = Color.LightGray,
          textAlign = TextAlign.Center
        )
      }
    }
  }
}
