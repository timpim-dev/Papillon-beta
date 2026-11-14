package xyz.getpapillon.wear

import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.TimeUnit

class WearDataListenerService : WearableListenerService() {
  override fun onDataChanged(dataEvents: DataEventBuffer) {
    for (event in dataEvents) {
      if (event.type == DataEvent.TYPE_CHANGED && event.dataItem.uri.path == WearRepository.SYNC_PATH) {
        val payload = DataMapItem.fromDataItem(event.dataItem).dataMap.getString("payload")
        if (!payload.isNullOrBlank()) {
          WearRepository.saveRawPayload(applicationContext, payload)
        }
      }
    }
  }

  override fun onChannelOpened(channel: ChannelClient.Channel) {
    if (channel.path != WearRepository.APK_UPDATE_CHANNEL_PATH) {
      super.onChannelOpened(channel)
      return
    }
    val channelClient = Wearable.getChannelClient(applicationContext)
    try {
      val inputStream = Tasks.await(channelClient.getInputStream(channel), 20, TimeUnit.SECONDS)
      val tempFile = File(applicationContext.cacheDir, "papillon-wear-update.apk.tmp")
      val targetFile = File(applicationContext.cacheDir, "papillon-wear-update.apk")
      inputStream.use { input ->
        FileOutputStream(tempFile).use { output ->
          input.copyTo(output, bufferSize = 32 * 1024)
          output.flush()
        }
      }
      if (tempFile.exists() && tempFile.length() > 0L) {
        if (targetFile.exists()) targetFile.delete()
        tempFile.renameTo(targetFile)
        WearRepository.setPendingApkUpdatePath(applicationContext, targetFile.absolutePath)
        WearRepository.installPendingApkUpdate(applicationContext)
      }
    } catch (_: Throwable) {
    } finally {
      try {
        Tasks.await(channelClient.close(channel), 5, TimeUnit.SECONDS)
      } catch (_: Throwable) {
      }
    }
  }
}
