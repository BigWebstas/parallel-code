package com.parallelcode.phone

/** One changed file in a unified diff, as the desktop's diff view lists it. */
data class DiffFile(val path: String, val added: Int, val removed: Int, val lines: List<String>, val binary: Boolean)

/** Split `git diff` output into files; hunk lines keep their ' ', '+', '-' or '@@' prefix. */
fun parseUnifiedDiff(diff: String): List<DiffFile> {
    val files = mutableListOf<DiffFile>()
    var path: String? = null
    var lines = mutableListOf<String>()
    var added = 0
    var removed = 0
    var binary = false
    var inHunk = false

    fun finish() {
        path?.let { files.add(DiffFile(it, added, removed, lines, binary)) }
        lines = mutableListOf()
        added = 0
        removed = 0
        binary = false
        inHunk = false
    }

    for (line in diff.lineSequence()) {
        when {
            line.startsWith("diff --git ") -> {
                finish()
                // "diff --git a/old b/new": the new path, which +++ may refine below.
                path = line.substringAfter(" b/", line.removePrefix("diff --git "))
            }
            !inHunk && line.startsWith("+++ ") -> {
                val target = line.removePrefix("+++ ")
                if (target != "/dev/null") path = target.removePrefix("b/")
            }
            !inHunk && line.startsWith("--- ") -> {
                val source = line.removePrefix("--- ")
                if (path == null && source != "/dev/null") path = source.removePrefix("a/")
            }
            line.startsWith("Binary files ") -> binary = true
            line.startsWith("@@") -> {
                inHunk = true
                lines.add(line)
            }
            inHunk && line.startsWith("+") -> {
                added++
                lines.add(line)
            }
            inHunk && line.startsWith("-") -> {
                removed++
                lines.add(line)
            }
            inHunk && (line.startsWith(" ") || line.startsWith("\\")) -> lines.add(line)
        }
    }
    finish()
    return files
}
