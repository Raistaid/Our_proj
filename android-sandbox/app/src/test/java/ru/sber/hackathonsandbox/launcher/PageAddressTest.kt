package ru.sber.hackathonsandbox.launcher

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class PageAddressTest {

    @Test
    fun addsHttpsWhenSchemeMissing() {
        assertEquals("https://example.com/game/", PageAddress.url(" example.com/game/ "))
    }

    @Test
    fun keepsHttpForLocalServers() {
        assertEquals("http://192.168.1.10:8080", PageAddress.url("http://192.168.1.10:8080"))
    }

    @Test
    fun rejectsNonWebSchemesAndEmptyInput() {
        assertNull(PageAddress.url("ftp://example.com"))
        assertNull(PageAddress.url("   "))
    }
}
