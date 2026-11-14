package expo.modules.papillonandroidwidgets

import android.content.Intent
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class PapillonAndroidWidgetsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("PapillonAndroidWidgets")

    AsyncFunction("syncWidgetsSnapshot") { jsonPayload: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      WidgetStore.saveSnapshot(context, jsonPayload)
      WidgetUpdater.updateAll(context)
      WearDataLayerSync.publishSnapshot(context, jsonPayload)
      true
    }

    AsyncFunction("reloadWidgets") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      WidgetUpdater.updateAll(context)
      true
    }

    AsyncFunction("syncWatchSnapshotNow") {
      val context = appContext.reactContext ?: return@AsyncFunction false
      val raw = WidgetStore.readRawJson(context) ?: return@AsyncFunction false
      WearDataLayerSync.publishSnapshot(context, raw)
      true
    }

    AsyncFunction("getConnectedWearNodes") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      WearDataLayerSync.getConnectedNodes(context)
    }

    AsyncFunction("consumePendingWearTaskToggles") {
      val context = appContext.reactContext ?: return@AsyncFunction emptyList<Map<String, Any>>()
      WidgetStore.consumePendingWearToggles(context)
    }

    AsyncFunction("installApkOnPhone") { filePathOrUri: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val cleanPath = filePathOrUri.removePrefix("file://")
      val file = File(cleanPath)
      if (!file.exists()) {
        return@AsyncFunction false
      }
      val authority = "${context.packageName}.papillon_updater.fileprovider"
      val contentUri: Uri = FileProvider.getUriForFile(context, authority, file)
      val intent = Intent(Intent.ACTION_VIEW).apply {
        setDataAndType(contentUri, "application/vnd.android.package-archive")
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      }
      context.startActivity(intent)
      true
    }

    AsyncFunction("sendApkToWatch") { filePathOrUri: String ->
      val context = appContext.reactContext ?: return@AsyncFunction false
      val cleanPath = filePathOrUri.removePrefix("file://")
      val file = File(cleanPath)
      WearDataLayerSync.sendApkToConnectedWatches(context, file)
    }
  }
}
