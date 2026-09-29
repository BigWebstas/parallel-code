package com.parallelcode.phone

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TaskDiffTest {
    @Test
    fun splitsFilesAndCountsLines() {
        val files = parseUnifiedDiff(
            """
            diff --git a/src/a.kt b/src/a.kt
            index 1..2 100644
            --- a/src/a.kt
            +++ b/src/a.kt
            @@ -1,2 +1,2 @@
             keep
            -old
            +new
            +more
            diff --git a/gone.txt b/gone.txt
            deleted file mode 100644
            --- a/gone.txt
            +++ /dev/null
            @@ -1 +0,0 @@
            -bye
            diff --git a/logo.png b/logo.png
            Binary files a/logo.png and b/logo.png differ
            """.trimIndent(),
        )
        assertEquals(listOf("src/a.kt", "gone.txt", "logo.png"), files.map { it.path })
        assertEquals(2, files[0].added)
        assertEquals(1, files[0].removed)
        assertEquals(listOf("@@ -1,2 +1,2 @@", " keep", "-old", "+new", "+more"), files[0].lines)
        assertEquals(1, files[1].removed)
        assertTrue(files[2].binary)
    }

    @Test
    fun emptyDiffHasNoFiles() {
        assertEquals(emptyList<DiffFile>(), parseUnifiedDiff(""))
    }
}
