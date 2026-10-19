# Основа Android-песочницы

- Репозиторий: https://github.com/vveidi/sber-hse-hackathon-2026-android
- Ревизия: `1ba091d72e9e0917af70d88319de51522a54f207` (ветка `master`).
- Исходная документация: [README.upstream.md](README.upstream.md), [CONTEXT.md](CONTEXT.md).

В проект «Засвет» перенесены Android-исходники, ресурсы, Gradle Wrapper и тесты. Настройки IDE не переносились. Изменения: отдельный application ID `io.github.raistaid.zasvet.sandbox`, название приложения, кнопка запуска встроенной игры, копирование `../game` в assets при сборке и документация. Обработчики событий, мост и поведение WebView взяты из исходной песочницы.
