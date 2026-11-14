package expo.modules.papillonandroidwidgets

import android.content.Context
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

object WearDataLayerSync {
  const val SYNC_PATH = "/papillon/sync"
  const val REQUEST_SYNC_PATH = "/papillon/request_sync"

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
}
