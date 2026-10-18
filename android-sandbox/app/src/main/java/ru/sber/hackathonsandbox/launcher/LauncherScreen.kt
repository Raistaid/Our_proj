package ru.sber.hackathonsandbox.launcher

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import ru.sber.hackathonsandbox.R

/** Стартовый экран: ввод URL страницы, история адресов, Test Page и настройки. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LauncherScreen(
    history: LaunchHistory,
    showsDebugControls: Boolean,
    onShowsDebugControlsChange: (Boolean) -> Unit,
    onOpenPage: (String) -> Unit,
) {
    var address by rememberSaveable { mutableStateOf("") }
    var isAddressInvalid by rememberSaveable { mutableStateOf(false) }

    fun open(url: String) {
        history.add(url)
        address = url
        onOpenPage(url)
    }

    fun openAddress() {
        val url = PageAddress.url(address)
        isAddressInvalid = url == null
        url?.let(::open)
    }

    Scaffold(topBar = { TopAppBar(title = { Text("Засвет — песочница") }) }) { padding ->
        LazyColumn(
            contentPadding = PaddingValues(
                start = 16.dp,
                end = 16.dp,
                top = padding.calculateTopPadding() + 8.dp,
                bottom = padding.calculateBottomPadding() + 24.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier
                .fillMaxSize()
                .imePadding(),
        ) {
            item {
                Button(
                    onClick = { onOpenPage(PageAddress.BUNDLED_GAME) },
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Играть в «Засвет»")
                }
            }
            item { SectionFooter("Игра встроена в приложение. Интернет для неё не нужен.") }
            item { SectionHeader("Адрес игры") }
            item {
                OutlinedTextField(
                    value = address,
                    onValueChange = { address = it },
                    label = { Text("Ссылка на index.html игры") },
                    singleLine = true,
                    isError = isAddressInvalid,
                    supportingText = if (isAddressInvalid) {
                        { Text("Нужен адрес http(s), например https://example.com/game/") }
                    } else {
                        null
                    },
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.None,
                        autoCorrectEnabled = false,
                        keyboardType = KeyboardType.Uri,
                        imeAction = ImeAction.Go,
                    ),
                    keyboardActions = KeyboardActions(onGo = { openAddress() }),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            item {
                Button(
                    onClick = ::openAddress,
                    enabled = address.isNotBlank(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text("Открыть")
                }
            }

            item {
                FilledTonalButton(
                    onClick = { onOpenPage(PageAddress.TEST_PAGE) },
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp),
                ) {
                    Text("Открыть тестовую страницу")
                }
            }
            item { SectionFooter("Кнопка на каждое событие контракта: проверить мост без своей игры.") }

            if (history.urls.isNotEmpty()) {
                item { SectionHeader("Недавние", Modifier.padding(top = 16.dp)) }
                items(history.urls.toList(), key = { it }) { url ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .clickable { open(url) },
                    ) {
                        Text(
                            url,
                            color = MaterialTheme.colorScheme.primary,
                            maxLines = 2,
                            overflow = TextOverflow.Ellipsis,
                            modifier = Modifier
                                .weight(1f)
                                .padding(vertical = 8.dp),
                        )
                        IconButton(onClick = { history.remove(url) }) {
                            Icon(painterResource(R.drawable.ic_close), contentDescription = "Удалить из недавних")
                        }
                    }
                }
            }

            item {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp),
                ) {
                    Text("Кнопка лога на экране игры", modifier = Modifier.weight(1f))
                    Switch(checked = showsDebugControls, onCheckedChange = onShowsDebugControlsChange)
                }
            }
            item { SectionFooter("Выключите для чистого вида на демо. Кнопка «закрыть» остаётся всегда.") }
        }
    }
}

@Composable
private fun SectionHeader(text: String, modifier: Modifier = Modifier) {
    Text(
        text.uppercase(),
        style = MaterialTheme.typography.labelMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier,
    )
}

@Composable
private fun SectionFooter(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.bodySmall,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
    )
}
