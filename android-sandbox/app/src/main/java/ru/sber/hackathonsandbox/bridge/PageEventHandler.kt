package ru.sber.hackathonsandbox.bridge

/** Итог обработки одного сообщения из Bridge. */
sealed class BridgeResult {
    data class Handled(
        val type: PageEventType,
        val actions: List<BridgeAction>,
        val warnings: List<String>,
    ) : BridgeResult()

    data class UnknownEvent(val type: String) : BridgeResult()
    data class InvalidMessage(val reason: String) : BridgeResult()
}

/**
 * Переводит сообщения страницы в Bridge Actions.
 * Хранит состояние одной сессии Game Screen, поэтому на каждый экран создаётся новый.
 */
class PageEventHandler {

    private var hasCompleted = false

    fun handle(body: Any?): BridgeResult = when (val result = PageMessageParser.parse(body)) {
        is PageMessageParser.Result.Failure -> BridgeResult.InvalidMessage(result.failure.reason)
        is PageMessageParser.Result.Success -> handle(result.event)
    }

    private fun handle(event: PageEvent): BridgeResult {
        val type = event.knownType ?: return BridgeResult.UnknownEvent(event.type)
        return when (type) {
            PageEventType.CLOSE -> BridgeResult.Handled(type, listOf(BridgeAction.Close), emptyList())
            PageEventType.FINISH -> BridgeResult.Handled(type, listOf(BridgeAction.ShowToast("Игра завершена")), emptyList())
            PageEventType.COMPLETED -> {
                val warnings = if (hasCompleted) {
                    listOf("COMPLETED_EVENT отправлен повторно: по контракту его отправляют один раз")
                } else {
                    emptyList()
                }
                hasCompleted = true
                BridgeResult.Handled(type, listOf(BridgeAction.ShowToast("Прогресс засчитан")), warnings)
            }
            PageEventType.VIBRATION -> BridgeResult.Handled(type, listOf(BridgeAction.Vibrate), emptyList())
            PageEventType.SHARING -> sharing(event)
        }
    }

    private fun sharing(event: PageEvent): BridgeResult {
        val warnings = mutableListOf<String>()
        val image = event.image?.let { raw ->
            ShareImage.from(raw).also {
                if (it == null) {
                    warnings += "Поле image не распознано: нужен data URL с base64-картинкой или http(s)-ссылка"
                }
            }
        }
        if (event.text == null && image == null) {
            return BridgeResult.InvalidMessage("SHARING_EVENT без text и image: делиться нечем")
        }
        return BridgeResult.Handled(
            PageEventType.SHARING,
            listOf(BridgeAction.Share(SharePayload(event.text, image))),
            warnings,
        )
    }
}
