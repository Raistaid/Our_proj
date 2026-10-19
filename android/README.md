# Android-версия «Засвет»

Небольшая Java-оболочка загружает встроенную папку `game/` в системный Android WebView. Игра работает без интернета, не запрашивает доступ к сети, файлам, камере или контактам. Разрешение на вибрацию используется после успешного кадра.

Поддерживаются Android 8.0 и новее с обновлённым Android System WebView. Поворот экрана сохраняет текущую игру; системная кнопка «Назад» возвращает на главный экран, а с главного экрана закрывает приложение.

## Сборка на Windows

```powershell
npm run build:android
```

Скрипт загрузит проверенные по контрольным суммам JDK 21 и Android SDK Build Tools 35 в `.local/android-tools/`, соберёт приложение и проверит подпись APK. Android Studio и Gradle не требуются. Инструменты не устанавливаются в систему.

Результат: `downloads/zasvet-android.apk` и файл с SHA-256 рядом с ним. Готовая сборка доступна в [Releases](https://github.com/Raistaid/Zasvet/releases/latest). В APK включается актуальное содержимое `game/`, поэтому после изменений игры сборку нужно повторить.

## Сборка на macOS и Linux

Установите JDK 21 или новее, Android SDK Platform 35 и Build Tools 35.0.0. Укажите пути к JDK и SDK:

```bash
export JAVA_HOME=/path/to/jdk
export ANDROID_HOME=/path/to/android-sdk
python3 tools/build-android.py
```

Скрипт использует тот же Java-код, ресурсы, версию и локальный ключ подписи, что и Windows-сборка. Значок приложения повторяет SVG favicon игры; адаптивная иконка поддерживает разные формы и одноцветную тему Android 13+.

APK 0.0.2 подписан новым локальным ключом: ключ предыдущей сборки отсутствовал на этой машине. Если Android не позволяет обновить установленную старую версию, сначала удалите её и затем установите новую.

Ключ локальной подписи хранится в `.local/android-signing/zasvet.p12` и не попадает в Git. Его нужно сохранить для выпуска обновлений с той же подписью. Пароль локального ключа и alias заданы в скрипте сборки (`android` и `zasvet`).

Для установки по USB после включения отладки на телефоне:

```powershell
& (Get-ChildItem .local/android-tools/platform-tools -Filter adb.exe -Recurse | Select-Object -First 1).FullName install -r downloads/zasvet-android.apk
```
