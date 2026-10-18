package ru.sber.hackathonsandbox.bridge

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.util.Base64

class PageEventHandlerTest {

    /** Валидный PNG 1×1. */
    private val pngBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    private val pngDataUrl = "data:image/png;base64,$pngBase64"

    private fun json(source: String) = JSONObject(source)

    private fun sharing(text: String?, image: ShareImage? = null, warnings: List<String> = emptyList()) =
        BridgeResult.Handled(PageEventType.SHARING, listOf(BridgeAction.Share(SharePayload(text, image))), warnings)

    // Разбор сообщения

    @Test
    fun flatFormat() {
        assertEquals(sharing("Привет"), PageEventHandler().handle(json("""{"type":"SHARING_EVENT","text":"Привет"}""")))
    }

    @Test
    fun paramsFormat() {
        assertEquals(
            sharing("Привет"),
            PageEventHandler().handle(json("""{"type":"SHARING_EVENT","params":{"text":"Привет"}}""")),
        )
    }

    @Test
    fun dataParamsFormat() {
        assertEquals(
            sharing("Привет"),
            PageEventHandler().handle(json("""{"data":{"type":"SHARING_EVENT","params":{"text":"Привет"}}}""")),
        )
    }

    @Test
    fun jsonStringBody() {
        assertEquals(
            BridgeResult.Handled(PageEventType.VIBRATION, listOf(BridgeAction.Vibrate), emptyList()),
            PageEventHandler().handle("""{"type":"VIBRATION_EVENT"}"""),
        )
    }

    @Test
    fun plainStringIsInvalid() {
        assertEquals(
            BridgeResult.InvalidMessage(PageMessageParser.Failure.NOT_AN_OBJECT.reason),
            PageEventHandler().handle("hello"),
        )
    }

    @Test
    fun nullIsInvalid() {
        assertEquals(
            BridgeResult.InvalidMessage(PageMessageParser.Failure.NOT_AN_OBJECT.reason),
            PageEventHandler().handle(JSONObject.NULL),
        )
    }

    @Test
    fun missingTypeIsInvalid() {
        val handler = PageEventHandler()
        val expected = BridgeResult.InvalidMessage(PageMessageParser.Failure.MISSING_TYPE.reason)
        assertEquals(expected, handler.handle(json("""{"score":42}""")))
        assertEquals(expected, handler.handle(json("""{"type":""}""")))
    }

    @Test
    fun unknownEvent() {
        assertEquals(
            BridgeResult.UnknownEvent("LEVEL_UP_EVENT"),
            PageEventHandler().handle(json("""{"type":"LEVEL_UP_EVENT"}""")),
        )
    }

    // События контракта

    @Test
    fun close() {
        assertEquals(
            BridgeResult.Handled(PageEventType.CLOSE, listOf(BridgeAction.Close), emptyList()),
            PageEventHandler().handle(json("""{"type":"CLOSE_EVENT"}""")),
        )
    }

    @Test
    fun finish() {
        assertEquals(
            BridgeResult.Handled(PageEventType.FINISH, listOf(BridgeAction.ShowToast("Игра завершена")), emptyList()),
            PageEventHandler().handle(json("""{"type":"FINISH_EVENT"}""")),
        )
    }

    @Test
    fun completedTwiceWarnsOnSecond() {
        val handler = PageEventHandler()
        assertEquals(
            BridgeResult.Handled(PageEventType.COMPLETED, listOf(BridgeAction.ShowToast("Прогресс засчитан")), emptyList()),
            handler.handle(json("""{"type":"COMPLETED_EVENT"}""")),
        )
        val second = handler.handle(json("""{"type":"COMPLETED_EVENT"}""")) as BridgeResult.Handled
        assertEquals(1, second.warnings.size)
    }

    @Test
    fun completedStateIsPerHandler() {
        PageEventHandler().handle(json("""{"type":"COMPLETED_EVENT"}"""))
        assertEquals(
            BridgeResult.Handled(PageEventType.COMPLETED, listOf(BridgeAction.ShowToast("Прогресс засчитан")), emptyList()),
            PageEventHandler().handle(json("""{"type":"COMPLETED_EVENT"}""")),
        )
    }

    // Шеринг

    @Test
    fun sharingWithDataUrlImage() {
        val body = JSONObject().put("type", "SHARING_EVENT").put("text", "Я прошёл").put("image", pngDataUrl)
        assertEquals(
            sharing("Я прошёл", ShareImage.Data(Base64.getDecoder().decode(pngBase64))),
            PageEventHandler().handle(body),
        )
    }

    @Test
    fun sharingWithRemoteImageOnly() {
        val url = "https://cdn.example.com/result.png"
        assertEquals(
            sharing(null, ShareImage.Remote(url)),
            PageEventHandler().handle(JSONObject().put("type", "SHARING_EVENT").put("image", url)),
        )
    }

    @Test
    fun sharingWithBrokenImageKeepsTextAndWarns() {
        val result = PageEventHandler().handle(
            json("""{"type":"SHARING_EVENT","text":"Текст","image":"data:image/png;base64,AAAA"}""")
        ) as BridgeResult.Handled
        assertEquals(listOf(BridgeAction.Share(SharePayload("Текст", null))), result.actions)
        assertEquals(1, result.warnings.size)
    }

    @Test
    fun sharingWithoutContentIsInvalid() {
        assertTrue(PageEventHandler().handle(json("""{"type":"SHARING_EVENT","text":"  "}""")) is BridgeResult.InvalidMessage)
    }

    @Test
    fun sharingWithOnlyBrokenImageIsInvalid() {
        assertTrue(
            PageEventHandler().handle(json("""{"type":"SHARING_EVENT","image":"javascript:alert(1)"}""")) is BridgeResult.InvalidMessage
        )
    }
}

class BridgeScriptTest {

    @Test
    fun unwrapsObjectBody() {
        val body = BridgeScript.unwrap("""{"body":{"type":"CLOSE_EVENT"}}""") as JSONObject
        assertEquals("CLOSE_EVENT", body.getString("type"))
    }

    @Test
    fun unwrapsStringBody() {
        assertEquals("""{"type":"VIBRATION_EVENT"}""", BridgeScript.unwrap("""{"body":"{\"type\":\"VIBRATION_EVENT\"}"}"""))
    }

    @Test
    fun missingBodyIsNull() {
        assertEquals(JSONObject.NULL, BridgeScript.unwrap("{}"))
    }

    @Test
    fun unserializableBodyIsString() {
        assertEquals("[object Window]", BridgeScript.unwrap("""{"unserializable":"[object Window]"}"""))
    }
}
