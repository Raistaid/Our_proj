package ru.sber.hackathonsandbox.bridge

import org.json.JSONException
import org.json.JSONObject

/** Типы Page Event из контракта хакатона «страница → приложение». */
enum class PageEventType(val rawValue: String) {
    CLOSE("CLOSE_EVENT"),
    FINISH("FINISH_EVENT"),
    COMPLETED("COMPLETED_EVENT"),
    VIBRATION("VIBRATION_EVENT"),
    SHARING("SHARING_EVENT");

    companion object {
        fun from(rawValue: String): PageEventType? = entries.firstOrNull { it.rawValue == rawValue }
    }
}

/** Одно сообщение, отправленное страницей через Bridge, после разбора. */
data class PageEvent(
    val type: String,
    val text: String?,
    val image: String?,
) {
    /** Тип из контракта или `null`, если событие неизвестно. */
    val knownType: PageEventType?
        get() = PageEventType.from(type)
}

object PageMessageParser {

    sealed class Result {
        data class Success(val event: PageEvent) : Result()
        data class Failure(val failure: PageMessageParser.Failure) : Result()
    }

    enum class Failure(val reason: String) {
        NOT_AN_OBJECT("Тело сообщения не объект и не JSON-строка с объектом"),
        MISSING_TYPE("В сообщении нет непустого поля type"),
    }

    /**
     * Разбирает тело сообщения. Принимает три формата:
     * `{ type, text, image }` (канонический), `{ type, params: { text, image } }`
     * и `{ data: { type, params: { text, image } } }`.
     * Тело может быть объектом или JSON-строкой с объектом.
     *
     * @param body значение `event.data` после JSON: [JSONObject], [String], число, [JSONObject.NULL] и т. д.
     */
    fun parse(body: Any?): Result {
        val dictionary = dictionary(from = body) ?: return Result.Failure(Failure.NOT_AN_OBJECT)
        val data = dictionary.opt("data") as? JSONObject
        val container = if (data != null && data.opt("type") is String) data else dictionary
        val type = container.opt("type") as? String
        if (type.isNullOrEmpty()) {
            return Result.Failure(Failure.MISSING_TYPE)
        }
        val params = container.opt("params") as? JSONObject
        return Result.Success(
            PageEvent(
                type = type,
                text = nonEmptyString(container.opt("text")) ?: nonEmptyString(params?.opt("text")),
                image = nonEmptyString(container.opt("image")) ?: nonEmptyString(params?.opt("image")),
            )
        )
    }

    private fun dictionary(from: Any?): JSONObject? = when (from) {
        is JSONObject -> from
        is String -> try {
            JSONObject(from)
        } catch (_: JSONException) {
            null
        }
        else -> null
    }

    private fun nonEmptyString(value: Any?): String? = (value as? String)?.takeIf { it.isNotBlank() }
}
