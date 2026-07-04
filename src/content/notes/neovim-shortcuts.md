---
title: "Neovim Shortcuts: Official Stock Keymap Notes"
date: 2026-07-04
topic: "Neovim"
draft: false
---

These notes are for stock Neovim before custom distributions such as LazyVim or AstroNvim. They include built-in commands and default mappings from the official Neovim help pages, including built-in plugins such as netrw.

Official sources:

- [Neovim quick reference](https://neovim.io/doc/user/quickref/)
- [Neovim command index](https://neovim.io/doc/user/index.html)
- [Motions](https://neovim.io/doc/user/motion/)
- [Insert mode and completion](https://neovim.io/doc/user/insert/)
- [Windows and buffers](https://neovim.io/doc/user/windows/)
- [Tabpages](https://neovim.io/doc/user/tabpage/)
- [Netrw file explorer](https://neovim.io/doc/user/pi_netrw.html)
- [Quickfix and location lists](https://neovim.io/doc/user/quickfix/)
- [LSP defaults](https://neovim.io/doc/user/lsp/)
- [Diagnostics](https://neovim.io/doc/user/diagnostic/)
- [Terminal](https://neovim.io/doc/user/terminal/)
- [Spell checking](https://neovim.io/doc/user/spell/)
- [Diff mode](https://neovim.io/doc/user/diff/)

## Reading Vim-Style Notation

Before anything else, it helps to know how Vim documentation writes things down. When you see `N` or `{count}`, it means an optional number before a command, so `5j` moves down 5 lines. `<CR>` is Enter or Return, `<Esc>` is Escape, `<C-x>` means Control plus x, and `<S-Left>` means Shift plus Left. `{motion}` stands for any movement command, such as `w`, `$`, or `}`, and `{operator}{motion}` is the core Vim grammar, as in `dw`, `d$`, or `y}`. A `!` after an Ex command forces the command, often discarding unsaved changes. Finally, `WORD` in capitals means a blank-separated word: `word` is punctuation-aware, while `WORD` is whitespace-aware.

## Mode Basics

You return to Normal mode from Insert, Visual, or command-line modes with `<Esc>`. `<C-c>` also returns to Normal mode and is similar to Escape, but with some differences around abbreviations and events.

To start inserting text, `i` inserts before the cursor and `I` inserts before the first non-blank character in the line, while `a` appends after the cursor and `A` appends at the end of the line. `o` opens a new line below and enters Insert mode, and `O` does the same on a new line above. `R` enters Replace mode, and `gR` enters Virtual Replace mode.

For selecting text, `v` starts characterwise Visual mode, `V` starts linewise Visual mode, and `<C-v>` starts blockwise Visual mode. `:` opens the Ex command-line, `/` opens the forward search command-line, and `?` opens the backward search command-line. In current Neovim defaults, `Q` replays the last recorded macro, and `gQ` enters Ex mode.

## Help and Discovery

`:help` opens help, and `:help {topic}` opens help for a specific topic, option, key, or command. Inside help, `<C-]>` follows the help tag under the cursor and `<C-t>` jumps back from a help tag. `<C-o>` takes you to an older jump position and `<C-i>` to a newer one. `:helpgrep {pattern}` searches the help files and fills the quickfix list, and `:copen` opens the quickfix results from `:helpgrep`. For reference material, `:h quickref` is the official quick reference, `:h index` is the index of commands, and `:h tutor` opens the Neovim tutor.

## File Editing, Saving, and Quitting

To open files, `:e {file}` edits a file, `:edit` reloads the current file, and `:edit!` reloads the current file and discards local changes. `:enew` creates a new unnamed buffer, and `:find {file}` finds a file in `'path'` and edits it. `gf` edits the file name under the cursor, as does `]f`, and `<C-^>` switches to the alternate file.

For orientation, `:pwd` prints the current directory, `:cd {dir}` changes the current directory, and `:cd -` changes to the previous directory. `:file` shows the current file name and cursor position, while `:files` shows alternate file names.

For saving, `:w` writes the current buffer, `:write {file}` writes to a file, and `:w! {file}` force-writes to a file. `:up` writes only if the buffer was modified, and `:wa` writes all changed buffers.

For quitting, `:q` quits the current window or buffer if it is safe to do so, and `:q!` quits and discards changes in the current buffer if needed. `:qa` quits everything if safe, and `:qa!` quits all and discards changes if needed. `:wq` writes and quits, and `:x` writes if modified and then quits. `ZZ` is the same idea as `:x`, and `ZQ` is the same idea as `:q!`. `<C-z>` suspends Neovim.

## File Exploration With Built-In Netrw

Open netrw by editing a directory: `nvim .`, `:edit .`, or one of the explore commands. `:Explore` explores the directory of the current file, `:Sexplore` opens the explorer in a horizontal split, and `:Vexplore` opens it in a vertical split. `:Hexplore` is a horizontal split explorer, `:Lexplore` toggles a left explorer, and `:Texplore` opens the explorer in a tab. `:Rexplore` returns to the explorer, `:Nexplore` is a vertical split explorer variant, and `:Pexplore` is a previous explorer variant. `:Ntree` uses tree mode with a selected root, and `:NetrwSettings` opens the netrw settings window.

Inside netrw, `<F1>` opens netrw help. `<CR>` enters a directory or opens a file, and `-` goes up one directory. `i` cycles the listing style through thin, long, wide, and tree, while `I` toggles the banner. `a` cycles between normal, hidden-list-only, and hide-matching modes, and `gh` is a quick toggle for dotfiles. `<C-h>` edits the file hiding list, and `<C-l>` refreshes the directory listing.

For sorting, `s` cycles sorting by name, time, or size, `r` reverses the sort order, and `S` edits the suffix priority for name sorting. `qf` shows file information.

For opening files, `o` opens the file or directory in a horizontal split, `v` in a vertical split, and `t` in a new tab. `p` previews the file, `P` opens it in the previously used window, `x` opens the file with the associated external program, and `X` executes the file under the cursor with `system()`.

For file management, `%` creates a new file in the current netrw directory, `d` creates a directory, `D` deletes the selected file or directory or the marked files, and `<Del>` deletes the selected file or directory. `R` renames the selected file or directory or the marked files. `cd` makes the browsing directory the current directory, `C` sets the editing window, and `gp` changes local file permissions. `gd` forces treatment as a directory, `gf` forces treatment as a file, and `gn` makes the directory under the cursor the top of the tree.

For history and bookmarks, `u` goes to the previous directory in netrw history and `U` goes forward. `mb` bookmarks the current directory, `gb` goes to a bookmarked directory, and `qb` lists bookmarks and history.

Netrw also has a marked-files workflow. `mf` marks a file, `mF` unmarks files, and `mu` unmarks all marked files. `mr` marks files by a shell-style pattern, and `mt` sets the current directory as the marked-file target. With a target set, `mc` copies marked files to the target directory and `mm` moves them there. `md` diffs marked files, `me` puts marked files in the argument list and edits them, and `mg` runs `vimgrep` over marked files. `mh` toggles marked file suffixes in the hiding list, `mT` runs ctags on marked files, `mv` runs a Vim command on marked files, `mx` runs a shell command on marked files, `mX` runs a shell command on marked files as one group, and `mz` compresses or decompresses marked files. `qF` marks files using the quickfix list and `qL` marks files using the location list. Finally, `O` obtains the file under the cursor.

## Core Movement

The basic movements are `h` for left, `j` for down, `k` for up, and `l` for right; the arrow keys `<Left>`, `<Down>`, `<Up>`, and `<Right>` do the same.

Within a line, `0` goes to the first character, `^` to the first non-blank character, and `$` to the end of the line. The `g`-prefixed variants work on screen lines: `g0` goes to the first character of the screen line, `g^` to its first non-blank character, and `g$` to its end. `gm` goes to the middle of the screen line and `gM` to the middle of the text line. `g_` goes to the last non-blank character of the line, and `N|` goes to column N.

Across the file, `gg` goes to the first line, or line N with a count, and `G` goes to the last line, or line N with a count. `N%` goes N percent of the way through the file. Relative to the window, `H` goes to the top, `M` to the middle, and `L` to the bottom. `go` goes to byte offset N.

A few more line movements: `gj` and `gk` move down and up by display line, `+` moves down to the first non-blank character, `-` moves up to the first non-blank character, and `_` moves down N-1 lines to the first non-blank character.

## Character Search on a Line

`f{char}` moves to the next occurrence of a character on the line, and `F{char}` moves to the previous one. `t{char}` moves to just before the next occurrence, and `T{char}` moves to just after the previous one. `;` repeats the last `f`, `F`, `t`, or `T`, and `,` repeats it in the opposite direction.

## Word, Sentence, Paragraph, and Section Movement

For words, `w` moves to the next word and `W` to the next WORD, `e` to the end of the word and `E` to the end of the WORD, and `b` and `B` to the previous word and WORD. `ge` moves to the previous end of a word and `gE` to the previous end of a WORD.

For larger units, `)` moves to the next sentence and `(` to the previous one, while `}` moves to the next paragraph and `{` to the previous one. `]]` jumps to the next section start and `[[` to the previous section start; `][` jumps to the next section end and `[]` to the previous section end.

## Matching and Programming Motions

`%` jumps to the matching pair or preprocessor conditional. For unmatched brackets, `[(` finds the previous unmatched `(`, `[{` the previous unmatched `{`, `])` the next unmatched `)`, and `]}` the next unmatched `}`. For methods, `[m` goes to the previous method start, `[M` to the previous method end, `]m` to the next method start, and `]M` to the next method end. `[#` goes to the previous unmatched `#if` or `#else`, and `]#` to the next unmatched `#else` or `#endif`. `[*` goes to the previous start of a C-style comment and `]*` to the next end of one. `gd` goes to the local declaration under the cursor, and `gD` goes to the global declaration.

## Scrolling and View Position

`<C-e>` scrolls the window down one line and `<C-y>` scrolls it up one line. `<C-d>` scrolls down half a page and `<C-u>` scrolls up half a page, while `<C-f>` pages forward and `<C-b>` pages backward.

To reposition the view around the current line, `zt` or `z<CR>` puts the current line at the top, `zz` or `z.` centers it, and `zb` or `z-` puts it at the bottom. For horizontal scrolling, `zh` scrolls right and `zl` scrolls left, while `zH` and `zL` scroll half a screen right and left. `<C-l>` redraws the screen.

## Search and Substitute

`/{pattern}<CR>` searches forward and `?{pattern}<CR>` searches backward. `/<CR>` repeats the last search forward and `?<CR>` repeats it backward. `n` repeats the last search in the same direction and `N` in the opposite direction. `*` searches forward for the identifier under the cursor and `#` searches backward for it; `g*` and `g#` do the same but allow partial matches.

For substitution, `:%s/old/new/g` replaces all matches in the file, and `:%s/old/new/gc` does the same with confirmation. `:s/old/new/` replaces the first match on the current line, and `:s/old/new/g` replaces all matches on the current line. `&` repeats the previous substitute on the current line without flags. `:vimgrep /pat/g **/*` searches files with the internal grep and fills the quickfix list, while `:grep {args}` runs the external grep program and fills quickfix. `:nohlsearch` clears the search highlight.

Some useful search pattern atoms: `.` matches any single character, `^` matches the start of a line, and `$` matches the end of a line. `\<` matches the start of a word and `\>` the end of a word. `\s` matches whitespace and `\S` matches non-whitespace. For repetition, `*` matches zero or more of the previous atom, `\+` one or more, `\=` zero or one, and `\{2,5}` two to five. `\|` is a pattern alternative, and `\(...\)` groups a pattern.

## Marks, Jump List, and Change List

`m{a-zA-Z}` sets a mark. `` `{mark} `` jumps to the exact mark position, and `'{mark}` jumps to the mark's line at the first non-blank character. `` `` `` jumps to the position before the last jump, and `''` jumps to the line before the last jump.

Several automatic marks are worth knowing: `` `0 `` is the position where Neovim last exited, `` `" `` is the position when you last edited this file, `` `[ `` and `` `] `` are the start and end of the last changed or put text, `` `< `` and `` `> `` are the start and end of the last Visual selection, and `` `. `` is the position of the last change. `:marks` shows active marks, and `:delmarks {marks}` deletes marks.

For the jump list, `<C-o>` goes to an older cursor position and `<C-i>` to a newer one, and `:jumps` shows the jump list. For the change list, `g;` goes to an older position and `g,` to a newer one, and `:changes` shows the change list.

## Operators: The Core Vim Grammar

Operators combine with motions and text objects. For example, `daw` deletes a word, `ci"` changes inside quotes, and `y}` yanks to the next paragraph.

The main operators are `d{motion}` to delete over a motion, `c{motion}` to change over a motion, and `y{motion}` to yank over a motion. `>{motion}` indents right and `<{motion}` indents left. `gq{motion}` formats text, and `gw{motion}` formats text while keeping the cursor in place. For case changes, `g~{motion}` toggles case, `gu{motion}` lowercases, and `gU{motion}` uppercases. `g?{motion}` applies ROT13. `!{motion}{cmd}` filters text through an external command, and `={motion}` reindents using equalprg or the built-in indent.

Doubling an operator applies it to the current line: `dd` deletes a line, `cc` changes a line, and `yy` yanks a line, as does `Y`. `>>` indents the line right and `<<` indents it left. `gqq` formats the current line, and `gww` formats it while keeping the cursor. `g~~` toggles case on the current line, `guu` lowercases it, and `gUU` uppercases it. `!!{cmd}` filters the current line through a command, and `==` reindents it.

## Text Objects

Use these after an operator or in Visual mode. Examples: `ciw`, `daw`, `yi"`, `va)`.

For words, `aw` is a word and `iw` is an inner word, while `aW` is a WORD and `iW` is an inner WORD. For sentences and paragraphs, `as` is a sentence and `is` an inner sentence, and `ap` is a paragraph and `ip` an inner paragraph. `al` covers all lines and `il` is an inner line.

For brackets and blocks, `ab` is a `()` block and `ib` its inner version, `aB` is a `{}` block and `iB` its inner version, and `a>` and `i>` are a `<>` block and its inner version. `at` is a tag block and `it` an inner tag block. For strings, `a'` and `i'` are a single-quoted string and its inner version, `a"` and `i"` a double-quoted string and its inner version, and `` a` `` and `` i` `` a backtick string and its inner version.

## Deleting, Changing, Replacing, Joining

`x` deletes the character under the cursor and `X` the character before it, while `D` deletes to the end of the line. `s` substitutes one or more characters, `S` substitutes one or more lines, and `C` changes to the end of the line. `r{char}` replaces characters with a given character, and `gr{char}` replaces without affecting layout. `J` joins lines with spacing, and `gJ` joins lines without inserting spaces. `~` toggles case and moves right. `<C-a>` adds to the number under or after the cursor, and `<C-x>` subtracts from it.

## Yank, Put, Registers, and Clipboard

`y{motion}` yanks text, and `yy` or `Y` yanks a line. `p` puts after the cursor or line, and `P` puts before it. `]p` puts after and adjusts the indent, while `[p` puts before and adjusts the indent. `gp` puts after and leaves the cursor after the new text, and `gP` does the same before.

`"{reg}{op}` uses a specific register for the next delete, yank, or put. `:reg` shows registers, and `:reg {names}` shows selected registers. When a clipboard provider is available, `"+y` yanks to the system clipboard and `"+p` pastes from it; on systems that support a primary selection, `"*y` yanks to it and `"*p` pastes from it.

Some registers are worth remembering. `"` is the unnamed register, `0` is the last yank register, and `1` through `9` are the delete history registers. `-` is the small delete register, and `_` is the black-hole register. `+` is the system clipboard register and `*` the primary selection register. `.` holds the last inserted text, `%` the current file name, `#` the alternate file name, `:` the last command-line, and `/` the last search pattern. `=` is the expression register.

## Insert Mode Editing

You leave Insert mode with `<Esc>` or `<C-c>`. `<C-o>{cmd}` runs one Normal command and then returns to Insert mode.

For deleting while inserting, `<BS>` deletes the character before the cursor, `<Del>` the character under the cursor, `<C-w>` the word before the cursor, and `<C-u>` the entered text back to the start of the line. For indentation, `<C-t>` increases the indent and `<C-d>` decreases it; `0<C-d>` removes all indent on the current line, and `^<C-d>` removes all indent on the current line and restores it on the next line.

For inserting special content, `<C-r>{reg}` inserts register contents, `<C-v>{char}` inserts a character literally, and `<C-k>{char1}{char2}` inserts a digraph. `<C-y>` inserts the character from the line above and `<C-e>` the character from the line below. `<C-a>` inserts the previously inserted text, and `<C-@>` inserts the previously inserted text and leaves Insert mode. `<C-n>` and `<C-p>` cycle to the next and previous keyword completion match.

## Insert Mode Completion

`<C-n>` and `<C-p>` complete with the next and previous match from `'complete'`. The `<C-x>` submode selects a specific completion source: `<C-x><C-l>` completes whole lines, `<C-x><C-n>` keywords in the current file going forward, and `<C-x><C-p>` keywords in the current file going backward. `<C-x><C-k>` completes from the dictionary and `<C-x><C-t>` from the thesaurus. `<C-x><C-i>` completes from the current and included files, `<C-x><C-]>` from tags, `<C-x><C-f>` completes file names, and `<C-x><C-d>` completes definitions or macros. `<C-x><C-v>` completes like the Vim command-line, `<C-x><C-u>` uses user-defined completion, and `<C-x><C-o>` uses omni completion. `<C-x>s` completes spelling suggestions, as does `<C-x><C-s>` where the terminal permits. `<C-x><C-r>` completes from register contents, and `<C-x><C-z>` stops completion without changing the text.

## Visual Mode

`v` starts and stops characterwise Visual mode, `V` linewise Visual mode, and `<C-v>` blockwise Visual mode. `o` moves the cursor to the other end of the selection, and `gv` reselects the previous Visual area.

Once you have a selection, `d` deletes it, `c` changes it, and `y` yanks it. `>` indents the selection right, `<` indents it left, and `=` reindents it. `~` toggles case, `u` lowercases, `U` uppercases, and `g?` applies ROT13. `J` joins the selected lines and `gJ` joins them without spaces. `!{cmd}` filters the selected lines through a command.

Blockwise Visual mode has some extras: `I` inserts the same text before the selected columns, `A` appends the same text after them, `r{char}` replaces the selected block characters, `c` changes the selected block, and `C` changes the selected block through the line ends.

## Repeat, Macros, and Global Commands

`.` repeats the last change. For macros, `q{a-z}` records a macro into a register, `q{A-Z}` appends to a recorded macro in a register, and pressing `q` while recording stops the recording. `@{reg}` executes a macro or register, `@@` repeats the previous macro, and `Q` replays the last recorded macro. `:@{reg}` executes a register as Ex commands, and `:@@` repeats the previous `:@`.

For global commands, `:g/{pattern}/{cmd}` runs a command on matching lines, `:g!/{pattern}/{cmd}` runs it on non-matching lines, and `:v/{pattern}/{cmd}` is the same idea as `:g!`. `:source {file}` reads Ex commands from a file, and `:source! {file}` reads Normal-mode commands from a file.

## Undo and Redo

`u` undoes and `<C-r>` redoes. `U` restores the last changed line. `:earlier {time}` goes to an older text state and `:later {time}` to a newer one, and `:undolist` shows the undo branches.

## Buffers

`:buffers` lists buffers, and `:files` lists buffers and files. `:badd {file}` adds a file to the buffer list, and `:buffer {N}` goes to buffer N. For moving between buffers, `:bnext` goes to the next buffer, `:bprevious` and `:bNext` go to the previous one, `:bfirst` goes to the first, `:blast` to the last, and `:bmodified` to the next modified buffer. `:bunload` unloads a buffer, and `:bdelete` deletes a buffer from the buffer list. `:ball` opens windows for all buffers or arguments, and `:unhide` opens windows for loaded buffers.

## Argument List

`:args` prints the argument list. `:next` goes to the next argument, and `:Next` and `:previous` go to the previous one. `:first` goes to the first argument and `:last` to the last, while `:argument N` goes to argument N. `:all` opens a window for every argument. `:wnext` writes the current file and edits the next argument, and `:wNext` writes the current file and edits the previous one.

## Windows and Splits

`<C-w>s` makes a horizontal split, and `:split {file}` makes a horizontal split and edits a file. `<C-w>v` makes a vertical split, and `:vsplit {file}` makes a vertical split and edits a file. `<C-w>n` and `:new` open a new empty window, and `:vnew` opens a new empty vertical window. `<C-w>q` quits a window, `<C-w>c` closes a window, and `<C-w>o` keeps only the current window.

For moving between windows, `<C-w>h`, `<C-w>j`, `<C-w>k`, and `<C-w>l` move to the window left, below, above, and right. `<C-w>w` moves to the next window and `<C-w>W` to the previous one, `<C-w>t` to the top-left window, `<C-w>b` to the bottom-right window, and `<C-w>p` to the previously active window.

For rearranging windows, `<C-w>r` rotates windows down or right and `<C-w>R` rotates them up or left, while `<C-w>x` exchanges the current window with the next window or window N. `<C-w>H`, `<C-w>J`, `<C-w>K`, and `<C-w>L` move the current window far left, to the bottom, to the top, and far right, and `<C-w>T` moves the current window to a new tab.

For resizing, `<C-w>=` equalizes window sizes. `<C-w>-` decreases the height and `<C-w>+` increases it, while `<C-w>_` sets the height, defaulting to maximum. `<C-w><` decreases the width and `<C-w>>` increases it, while `<C-w>|` sets the width, defaulting to maximum.

A few window commands work with tags and files: `<C-w>]` splits and jumps to the tag under the cursor, `<C-w>}` previews the tag under the cursor, `<C-w>f` splits and edits the file name under the cursor, and `<C-w>^` splits and edits the alternate file. `:wincmd {key}` runs a `<C-w>` window command from Ex mode.

## Tabs

A tabpage is a layout of one or more windows, not just a file tab.

`:tabnew` opens a new tab, `:tabedit {file}` edits a file in a new tab, and `:tabfind {file}` finds a file in `'path'` and opens it in a new tab. `:tab split` opens the current buffer in a new tab. `<C-w>gf` opens the file under the cursor in a new tab, and `<C-w>gF` does the same and jumps to the line.

For navigating tabs, `gt` goes to the next tab and `gT` to the previous one, while `{N}gt` goes to tab N and `{N}gT` goes N tabs backward. `<C-PageDown>` and `<C-PageUp>` also go to the next and previous tab. `g<Tab>` and `<C-w>g<Tab>` go to the last accessed tab. The Ex equivalents are `:tabnext` for the next tab, `:tabprevious` for the previous one, `:tabfirst` for the first, and `:tablast` for the last. `:tabs` lists tabs and their windows.

For managing tabs, `:tabclose` closes the current tab, `:tabonly` closes all other tabs, `:tabmove {N}` moves the current tab after tab N, and `:tabdo {cmd}` runs a command in each tab.

## Quickfix and Location Lists

Quickfix is global. Location lists are per-window. Many location list commands replace the `c` in quickfix with `l`.

To fill the quickfix list, `:make` runs the make program, `:grep {args}` runs the grep program, and `:vimgrep /pat/g files` uses the internal grep. `:copen` opens the quickfix window, `:cclose` closes it, and `:cwindow` opens the quickfix window only when there are entries and closes it otherwise.

For navigating quickfix entries, `:cc {N}` goes to item N, `:cnext` to the next item, `:cprevious` to the previous one, `:cfirst` to the first, and `:clast` to the last. `]q` and `[q` also move to the next and previous quickfix item, while `]<C-q>` and `[<C-q>` move to the next and previous quickfix file. `:colder` goes to an older quickfix list and `:cnewer` to a newer one. `:cdo {cmd}` runs a command for each quickfix item, and `:cfdo {cmd}` runs it for each quickfix file.

Location lists mirror all of this: `:lopen` opens the location list, `:lclose` closes it, and `:lwindow` opens it only when there are entries and closes it otherwise. `:ll {N}` goes to location item N, `:lnext` to the next item, and `:lprevious` to the previous one. `]l` and `[l` move to the next and previous location item, and `]<C-l>` and `[<C-l>` to the next and previous location file. `:lolder` and `:lnewer` go to older and newer location lists, and `:ldo {cmd}` and `:lfdo {cmd}` run a command for each location item or file.

## Tags

`:tag {tag}` jumps to a tag, and `<C-]>` jumps to the tag under the cursor. `g<C-]>` lists the matching tags for the tag under the cursor, `:tselect {tag}` lists matching tags and lets you select one, and `:tjump {tag}` jumps directly or lets you select when the match is ambiguous. `:tags` shows the tag stack, and `<C-t>` or `:pop` pops the tag stack. `:tnext` goes to the next matching tag, `:tprevious` to the previous one, `:trewind` to the first, and `:tlast` to the last. `:ptag {tag}` opens a preview window for a tag, and `<C-w>}` previews the tag under the cursor. `:pclose` or `<C-w>z` closes the preview window.

## Built-In LSP Defaults

These are stock Neovim LSP defaults. They depend on an LSP client/server being active and the server supporting the feature.

`gra` triggers a code action in Normal and Visual mode, `gri` goes to the implementation, `grn` renames the symbol, `grr` lists references, `grt` goes to the type definition, and `grx` runs a code lens. `gO` shows document symbols. `K` shows hover information when LSP attaches and `K` was not otherwise customized, and `<C-s>` in Insert mode shows signature help.

Several built-in mechanisms are wired through LSP when it is active: `<C-]>` uses the LSP tag function for go-to-definition when LSP sets `tagfunc`, `<C-w>]` splits and jumps using the LSP tag function when available, and `<C-w>}` previews the definition the same way. `gq{motion}` formats through LSP when LSP sets `formatexpr`, and `<C-x><C-o>` performs omni completion through LSP when LSP sets `omnifunc`.

For managing LSP itself, `:checkhealth vim.lsp` checks LSP status, `:lsp enable {name}` enables an LSP config, `:lsp disable {name}` disables one, `:lsp restart {name}` restarts an active LSP client or server, and `:lsp stop {name}` stops one.

## Diagnostics

`]d` goes to the next diagnostic and `[d` to the previous one, while `]D` goes to the last diagnostic and `[D` to the first. `<C-w>d` shows the diagnostic at the cursor in a floating window, and `:lua vim.diagnostic.open_float()` opens the diagnostic float manually. `:lua vim.diagnostic.setloclist()` puts diagnostics in the location list, and `:lua vim.diagnostic.setqflist()` puts them in the quickfix list.

## Folding

`zf{motion}` creates a manual fold, and `:{range}fold` creates a fold for a range. `zd` deletes the fold under the cursor, and `zD` deletes all folds under the cursor.

For opening and closing, `zo` opens the fold under the cursor and `zO` opens all folds under the cursor, while `zc` closes the fold under the cursor and `zC` closes all folds under it. `za` toggles the fold under the cursor and `zA` toggles all folds under it. `zv` opens just enough folds to view the cursor line.

Working across the whole buffer, `zm` folds more and `zM` closes all folds, while `zr` reduces folding and `zR` opens all folds. `zn` disables folding, `zN` enables it, and `zi` toggles folding globally for the window.

The fold method is an option: `:set foldmethod=manual` uses manual folds, `:set foldmethod=indent` folds by indent, `:set foldmethod=expr` folds by expression, `:set foldmethod=syntax` folds by syntax, and `:set foldmethod=marker` folds by markers.

## Terminal Mode

`:terminal` opens a terminal buffer, `:terminal {cmd}` runs a command in a terminal buffer, and `:edit term://bash` edits a terminal buffer directly. From the terminal's Normal mode, `i`, `I`, `a`, and `A` enter Terminal-mode, as does `:startinsert`, which enters the Terminal-mode/Insert-like input mode. `<C-\><C-n>` leaves Terminal-mode and enters Normal mode, and `<C-\><C-o>` runs one Normal command and returns to Terminal-mode.

## Spell Checking

`:set spell` enables spell checking and `:set nospell` disables it. `]s` goes to the next misspelled word and `[s` to the previous one, while `]S` and `[S` go to the next and previous bad word only, and `]r` and `[r` go to the next and previous rare word.

`z=` suggests corrections, and `1z=` uses the first spelling suggestion directly. `zg` adds a word as a good word to the spellfile and `zG` adds it as a good word to the internal word list, while `zw` marks a word as wrong in the spellfile and `zW` marks it as wrong internally. `zug` or `zuw` undoes `zg` or `zw` in the spellfile, and `zuG` or `zuW` undoes `zG` or `zW` internally. `<C-x>s` in Insert mode completes spelling suggestions.

## Diff Mode

`nvim -d file1 file2` starts in diff mode. `:diffsplit {file}` opens a file in a diff split, and `:vertical diffsplit {file}` opens it in a vertical diff split. `:diffthis` makes the current window part of the diff, `:diffoff` turns off diff in the current window, and `:diffoff!` turns it off in all diff windows in the current tab. `:diffupdate` updates the diff highlighting and folds.

Within a diff, `]c` goes to the next change and `[c` to the previous one. `do` obtains a change from the other buffer, the same as `:diffget`, and `dp` puts a change into the other buffer, the same as `:diffput`. The Ex commands `:diffget` and `:diffput` get a diff from and put a diff into another buffer.

## Command-Line Editing

`<Esc>` or `<C-c>` abandons the command-line. `<C-v>{char}` inserts a literal character, `<C-k>{char1}{char2}` inserts a digraph, and `<C-r>{reg}` inserts register contents.

For movement, `<Left>` and `<Right>` move one character, `<S-Left>` and `<S-Right>` move one word, and `<C-b>` and `<C-e>` go to the beginning and end of the command-line. For deleting, `<BS>` deletes the character before the cursor, `<Del>` the character under the cursor, `<C-w>` the word before the cursor, and `<C-u>` everything from the cursor to the start of the command-line.

For history, `<Up>` and `<Down>` recall older and newer command-lines matching the current prefix, while `<S-Up>` and `<S-Down>` recall older and newer command-lines from history regardless of prefix. `:history` shows the command-line history.

For completion, `<Tab>` performs command-line completion, `<C-d>` lists matching completions, `<C-a>` inserts all matches, and `<C-l>` inserts the longest common completion prefix. After wildcard completion, `<C-n>` and `<C-p>` cycle to the next and previous completion. During incremental search, `<C-g>` moves to the next match and `<C-t>` to the previous one.

## Ex Ranges and File Tokens

In Ex ranges, `.` is the current line, `$` is the last line, and `%` is the whole file, equivalent to `1,$`. `'<,'>` is the last Visual selection range, and `*` is the Visual selection range in an Ex command context. `{number}` is an absolute line number, `+N` is N lines after the previous address, and `-N` is N lines before it. `/{pattern}/` addresses the next line matching a pattern, and `?{pattern}?` the previous line matching one. As examples, `:1,10d` deletes lines 1 through 10, and `:%s/a/b/g` substitutes in the whole file.

Where a file name is expected, `%` means the current file name and `#` the alternate file name. `<cword>` is the word under the cursor, `<cWORD>` the WORD under the cursor, and `<cfile>` the file name under the cursor. The modifiers on `%` extract parts of the path: `%:p` is the current file's full path, `%:h` its directory or head, `%:t` its tail or name, `%:r` its root without the extension, and `%:e` its extension.

## Options and Mapping Commands Worth Knowing Before Plugins

`:set` shows modified options and `:set all` shows all options. `:set {option}` enables a boolean option or shows a non-boolean option, `:set no{option}` disables a boolean option, and `:set inv{option}` inverts one. `:set {option}?` shows an option's value, and `:set {option}&` resets it to the default. `:setlocal` sets a local option, `:setglobal` sets a global option, and `:options` lets you browse options interactively.

For mappings, `:map` lists mappings, and `:nmap`, `:imap`, and `:vmap` list Normal, Insert, and Visual mappings. `:map {lhs} {rhs}` maps in Normal and Visual modes, `:noremap {lhs} {rhs}` creates a non-recursive map, `:unmap {lhs}` removes a mapping, and `:mapclear` clears mappings for Normal and Visual modes. `:iabbrev {lhs} {rhs}` creates an Insert-mode abbreviation, and `:cabbrev {lhs} {rhs}` a command-line abbreviation. `:mksession {file}` saves a session.

## A Practical Learning Order

1. Learn Normal, Insert, Visual, and command-line modes.
2. Drill movement: `hjkl`, `w`, `b`, `e`, `0`, `^`, `$`, `gg`, `G`, `{`, `}`, `%`.
3. Learn operator grammar: `d`, `c`, `y`, `>`, `<`, `gq` plus motions and text objects.
4. Learn search: `/`, `?`, `n`, `N`, `*`, `#`, `:s`.
5. Learn files and buffers: `:e`, `:w`, `:q`, `:buffers`, `:bnext`, `:bdelete`.
6. Learn windows: `<C-w>s`, `<C-w>v`, `<C-w>h/j/k/l`, `<C-w>c`, `<C-w>o`.
7. Learn netrw enough to move without plugins: `:Explore`, `<CR>`, `-`, `i`, `o`, `v`, `t`, `%`, `d`, `R`, `D`.
8. Learn quickfix: `:vimgrep`, `:copen`, `]q`, `[q`, `:cdo`.
9. Learn built-in LSP defaults only after the editor fundamentals are comfortable.
