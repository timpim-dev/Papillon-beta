package expo.modules.papillonandroidwidgets

import androidx.core.content.FileProvider

/**
 * Isolated FileProvider subclass to serve downloaded update APKs cleanly without
 * conflicting with any other library's manifest FileProvider authority.
 */
class PapillonUpdaterFileProvider : FileProvider()
