package ru.sber.hackathonsandbox.game

import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.os.Build
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/** Вибрация через [Vibrator] и системное «поделиться» через `ACTION_SEND`. */
class AndroidBridgeEffects(private val context: Context) : BridgeEffects {

    override fun vibrate() {
        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            context.getSystemService(VibratorManager::class.java).defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            context.getSystemService(Vibrator::class.java)
        }
        val effect = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK)
        } else {
            VibrationEffect.createOneShot(30, VibrationEffect.DEFAULT_AMPLITUDE)
        }
        vibrator.vibrate(effect)
    }

    override suspend fun share(text: String?, image: Bitmap?) {
        val intent = Intent(Intent.ACTION_SEND)
        if (image != null) {
            val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", writeToCache(image))
            intent.type = "image/png"
            intent.putExtra(Intent.EXTRA_STREAM, uri)
            intent.clipData = ClipData.newRawUri(null, uri)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } else {
            intent.type = "text/plain"
        }
        text?.let { intent.putExtra(Intent.EXTRA_TEXT, it) }
        context.startActivity(Intent.createChooser(intent, null))
    }

    private suspend fun writeToCache(image: Bitmap): File = withContext(Dispatchers.IO) {
        val directory = File(context.cacheDir, "shared")
        directory.deleteRecursively()
        directory.mkdirs()
        File(directory, "share-${System.currentTimeMillis()}.png").also { file ->
            file.outputStream().use { image.compress(Bitmap.CompressFormat.PNG, 100, it) }
        }
    }
}
