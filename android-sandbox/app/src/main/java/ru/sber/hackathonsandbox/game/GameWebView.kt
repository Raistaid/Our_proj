package ru.sber.hackathonsandbox.game

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.net.Uri
import android.net.http.SslError
import android.os.Message
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.SslErrorHandler
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebStorage
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.net.toUri
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import ru.sber.hackathonsandbox.bridge.BridgeScript
import java.util.Locale

/**
 * WebView с Bridge, настроенная как в продукте: без кэша и хранилища между запусками,
 * звук только после действия пользователя, переходы за пределы Origin страницы блокируются.
 */
@Composable
fun GameWebView(session: GameSession, background: Color, modifier: Modifier = Modifier) {
    AndroidView(
        modifier = modifier,
        factory = { context -> createWebView(context, session, background) },
        onRelease = { webView ->
            // После падения процесса рендера WebView уже уничтожена в onRenderProcessGone.
            if ((webView.webViewClient as? GameWebViewClient)?.isRenderProcessGone != true) {
                webView.stopLoading()
                clearWebData(webView)
                webView.destroy()
            }
        },
    )
}

@SuppressLint("SetJavaScriptEnabled")
private fun createWebView(context: Context, session: GameSession, background: Color): WebView {
    WebView.setWebContentsDebuggingEnabled(true)
    val webView = WebView(context)
    webView.settings.apply {
        javaScriptEnabled = true
        domStorageEnabled = true
        cacheMode = WebSettings.LOAD_NO_CACHE
        mediaPlaybackRequiresUserGesture = true
        allowFileAccess = false
        allowContentAccess = false
        // Иначе window.open без жеста пользователя молча гаснет, и нарушение не попадает в Event Log.
        javaScriptCanOpenWindowsAutomatically = true
        // Новые окна приходят в onCreateWindow, где их блокируем, а не открываются поверх страницы.
        setSupportMultipleWindows(true)
    }
    webView.setBackgroundColor(background.toArgb())

    val client = GameWebViewClient(session, WebViewAssetLoader.Builder()
        .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(context))
        .build())
    webView.webViewClient = client
    webView.webChromeClient = GameChromeClient(session)
    installBridge(webView, session, client)

    // Хранилище WebView общее на приложение: чистим, чтобы каждое открытие начиналось с нуля.
    clearWebData(webView)
    webView.loadUrl(session.pageUrl)
    return webView
}

private fun installBridge(webView: WebView, session: GameSession, client: GameWebViewClient) {
    if (WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER) &&
        WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)
    ) {
        WebViewCompat.addWebMessageListener(webView, BridgeScript.OBJECT_NAME, setOf("*")) { _, message, sourceOrigin, isMainFrame, _ ->
            val envelope = message.data
            if (isMainFrame && envelope != null) {
                session.receive(BridgeScript.unwrap(envelope), sourceOrigin.toString())
            }
        }
        WebViewCompat.addDocumentStartJavaScript(webView, BridgeScript.source, setOf("*"))
    } else {
        // Старый WebView: скрипт ставится после загрузки страницы, события до этого момента теряются.
        webView.addJavascriptInterface(LegacyBridge(webView, session), BridgeScript.OBJECT_NAME)
        client.injectsBridgeOnLoad = true
    }
}

private fun clearWebData(webView: WebView) {
    WebStorage.getInstance().deleteAllData()
    CookieManager.getInstance().removeAllCookies(null)
    webView.clearCache(true)
}

private fun origin(uri: Uri): String {
    val scheme = uri.scheme?.lowercase(Locale.ROOT).orEmpty()
    val host = uri.host?.lowercase(Locale.ROOT).orEmpty()
    val port = if (uri.port == -1) "" else ":${uri.port}"
    return "$scheme://$host$port"
}

private class LegacyBridge(private val webView: WebView, private val session: GameSession) {

    @JavascriptInterface
    fun postMessage(envelope: String) {
        webView.post {
            val origin = webView.url?.let { origin(it.toUri()) }.orEmpty()
            session.receive(BridgeScript.unwrap(envelope), origin)
        }
    }
}

private class GameWebViewClient(
    private val session: GameSession,
    private val assetLoader: WebViewAssetLoader,
) : WebViewClient() {

    var injectsBridgeOnLoad = false
    var isRenderProcessGone = false
        private set

    /** Origin страницы: фиксируется на первом показе, чтобы редиректы при открытии не считались нарушением. */
    private var pageOrigin: String? = null
    private var hasFailed = false

    override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
        assetLoader.shouldInterceptRequest(request.url)

    override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
        val pageOrigin = pageOrigin
        if (!request.isForMainFrame || pageOrigin == null) {
            return false
        }
        val url = request.url
        if (url.scheme == "about" || origin(url) == pageOrigin) {
            return false
        }
        session.navigationBlocked("Переход на $url")
        return true
    }

    override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
        hasFailed = false
        session.pageLoadingStarted()
    }

    override fun onPageCommitVisible(view: WebView, url: String) {
        pageShown(view, url)
    }

    override fun onPageFinished(view: WebView, url: String) {
        pageShown(view, url)
        if (!hasFailed) {
            session.pageLoaded(url)
        }
    }

    override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
        if (request.isForMainFrame) {
            hasFailed = true
            session.loadFailed("${error.description} (код ${error.errorCode})")
        }
    }

    override fun onReceivedHttpError(view: WebView, request: WebResourceRequest, response: WebResourceResponse) {
        if (request.isForMainFrame) {
            hasFailed = true
            session.loadFailed("HTTP ${response.statusCode} ${response.reasonPhrase.orEmpty()}: ${request.url}".trim())
        }
    }

    @SuppressLint("WebViewClientOnReceivedSslError")
    override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) {
        handler.cancel()
        hasFailed = true
        session.loadFailed("Ошибка SSL-сертификата: ${error.url}")
    }

    /** Процесс рендера упал или убит по памяти: без обработки это роняет всё приложение. */
    override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
        isRenderProcessGone = true
        (view.parent as? ViewGroup)?.removeView(view)
        view.destroy()
        val reason = if (detail.didCrash()) "упал" else "остановлен системой из-за нехватки памяти"
        session.loadFailed("Процесс рендера WebView $reason. Закройте экран и откройте игру заново")
        return true
    }

    private fun pageShown(view: WebView, url: String) {
        if (pageOrigin == null && !url.startsWith("about:")) {
            pageOrigin = origin(url.toUri())
        }
        if (injectsBridgeOnLoad) {
            view.evaluateJavascript(BridgeScript.source, null)
        }
    }
}

private class GameChromeClient(private val session: GameSession) : WebChromeClient() {

    /**
     * Новое окно не открываем. Адрес приходит только в навигацию нового WebView,
     * поэтому подставляем временный WebView, ловим в нём адрес и сразу его уничтожаем.
     */
    override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: Message): Boolean {
        val catcher = WebView(view.context)
        var isReported = false
        fun report(url: String?) {
            if (isReported) {
                return
            }
            isReported = true
            session.navigationBlocked("Открытие нового окна: ${url ?: "пустой адрес"}")
            catcher.post { catcher.destroy() }
        }
        catcher.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                report(request.url.toString())
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                view.stopLoading()
                report(url)
            }
        }
        (resultMsg.obj as WebView.WebViewTransport).webView = catcher
        resultMsg.sendToTarget()
        view.postDelayed({ report(null) }, 1_000)
        return true
    }
}
