package ru.sber.hackathonsandbox.bridge

import org.json.JSONException
import org.json.JSONObject

/**
 * JS-часть Bridge: страница вызывает `window.postMessage`, скрипт пересылает сообщение в приложение.
 *
 * Канал WebView передаёт только строки, поэтому `event.data` уходит в конверте `{ body }`,
 * а приложение достаёт из него исходное значение: объект, строку, число или `null`.
 */
object BridgeScript {

    /** Имя JS-объекта, через который скрипт отправляет сообщения в приложение. */
    const val OBJECT_NAME = "hackathonBridge"

    val source = """
        (function () {
          if (window.__hackathonBridgeInstalled || window.top !== window) { return; }
          var bridge = window.$OBJECT_NAME;
          if (!bridge) { return; }
          window.__hackathonBridgeInstalled = true;
          window.addEventListener('message', function (event) {
            if (event.source !== window) { return; }
            var envelope;
            try {
              envelope = JSON.stringify({ body: event.data === undefined ? null : event.data });
            } catch (error) {
              envelope = JSON.stringify({ unserializable: String(event.data) });
            }
            bridge.postMessage(envelope);
          });
        })();
    """.trimIndent()

    /** Достаёт тело сообщения из конверта, который собрал [source]. */
    fun unwrap(envelope: String): Any? {
        val json = try {
            JSONObject(envelope)
        } catch (_: JSONException) {
            return envelope
        }
        if (json.has("unserializable")) {
            return json.optString("unserializable")
        }
        return json.opt("body") ?: JSONObject.NULL
    }
}
