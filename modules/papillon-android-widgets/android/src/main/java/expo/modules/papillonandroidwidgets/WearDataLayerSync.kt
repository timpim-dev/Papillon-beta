package expo.modules.papillonandroidwidgets

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import java.io.File
import java.io.FileInputStream
import java.util.concurrent.TimeUnit

object WearDataLayerSync {
  const val SYNC_PATH = "/papillon/sync"
  const val REQUEST_SYNC_PATH = "/papillon/request_sync"
  const val TOGGLE_TASK_PATH = "/papillon/toggle_task"
  const val APK_UPDATE_CHANNEL_PATH = "/papillon/apk_update"

  fun publishSnapshot(context: Context, jsonString: String) {
    try {
      val request = PutDataMapRequest.create(SYNC_PATH).apply {
        dataMap.putString("payload", jsonString)
        dataMap.putLong("timestamp", System.currentTimeMillis())
      }
      val putTask = Wearable.getDataClient(context).putDataItem(request.asPutDataRequest().setUrgent())
      putTask.addOnFailureListener {
        // Ignore when Google Play Services / Wear OS companion is unavailable.
      }
    } catch (_: Throwable) {
      // Safe no-op on devices without Wearable Data Layer support.
    }
  }

  fun getConnectedNodes(context: Context): List<Map<String, Any>> {
    return try {
      val nodes = Tasks.await(
        Wearable.getNodeClient(context).connectedNodes,
        6,
        TimeUnit.SECONDS
      )
      nodes.map { node ->
        mapOf(
          "id" to node.id,
          "displayName" to node.displayName,
          "isNearby" to node.isNearby
        )
      }
    } catch (_: Throwable) {
      emptyList()
    }
  }

  fun sendApkToConnectedWatches(context: Context, apkFile: File): Boolean {
    if (!apkFile.exists()) return false
    return try {
      val nodes = Tasks.await(
        Wearable.getNodeClient(context).connectedNodes,
        8,
        TimeUnit.SECONDS
      )
      if (nodes.isEmpty()) return false
      val channelClient = Wearable.getChannelClient(context)
      var sent = false
      for (node in nodes) {
        val channel = Tasks.await(
          channelClient.openChannel(node.id, APK_UPDATE_CHANNEL_PATH),
          10,
          TimeUnit.SECONDS
        )
        try {
          val outputStream = Tasks.await(
            channelClient.getOutputStream(channel),
            10,
            TimeUnit.SECONDS
          )
          outputStream.use { out ->
            FileInputStream(apkFile).use { input ->
              input.copyTo(out, bufferSize = 32 * 1024)
            }
            out.flush()
          }
          sent = true
        } finally {
          try {
            Tasks.await(channelClient.close(channel), 5, TimeUnit.SECONDS)
          } catch (_: Throwable) {
          }
        }
      }
      sent
    } catch (_: Throwable) {
      false
    }
  }
}
