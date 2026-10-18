package ru.sber.hackathonsandbox.launcher

import android.content.SharedPreferences
import androidx.compose.runtime.mutableStateListOf
import androidx.core.content.edit
import org.json.JSONArray
import org.json.JSONException
import java.net.URI
import java.net.URISyntaxException
import java.util.Locale

object PageAddress {

    /** The bundled game has an HTTPS origin and works without a development server. */
    const val BUNDLED_GAME = "https://appassets.androidplatform.net/assets/game/index.html"

    /** Встроенная Test Page: отдаётся из assets через WebViewAssetLoader, поэтому у неё обычный https-Origin. */
    const val TEST_PAGE = "https://appassets.androidplatform.net/assets/test-page.html"

    /** Превращает ввод пользователя в URL страницы. Без схемы подставляет `https://`. */
    fun url(input: String): String? {
        val trimmed = input.trim()
        if (trimmed.isEmpty()) {
            return null
        }
        val withScheme = if (trimmed.contains("://")) trimmed else "https://$trimmed"
        val uri = try {
            URI(withScheme)
        } catch (_: URISyntaxException) {
            return null
        }
        val scheme = uri.scheme?.lowercase(Locale.ROOT)
        if ((scheme != "http" && scheme != "https") || uri.host.isNullOrEmpty()) {
            return null
        }
        return withScheme
    }
}

/** Последние открытые адреса, новые сверху. */
class LaunchHistory(private val preferences: SharedPreferences) {

    val urls = mutableStateListOf<String>().apply { addAll(load()) }

    private val limit = 10

    fun add(url: String) {
        urls.remove(url)
        urls.add(0, url)
        while (urls.size > limit) {
            urls.removeAt(urls.lastIndex)
        }
        save()
    }

    fun remove(url: String) {
        urls.remove(url)
        save()
    }

    private fun load(): List<String> = try {
        val array = JSONArray(preferences.getString(SettingsKey.LAUNCH_HISTORY, null) ?: "[]")
        (0 until array.length()).map { array.getString(it) }
    } catch (_: JSONException) {
        emptyList()
    }

    private fun save() {
        preferences.edit { putString(SettingsKey.LAUNCH_HISTORY, JSONArray(urls.toList()).toString()) }
    }
}

object SettingsKey {
    const val SHOWS_DEBUG_CONTROLS = "showsDebugControls"
    const val LAUNCH_HISTORY = "launchHistory"
}
