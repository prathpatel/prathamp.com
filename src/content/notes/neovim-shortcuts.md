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

| Notation | Meaning |
| --- | --- |
| `N` or `{count}` | Optional number before a command, for example `5j` moves down 5 lines. |
| `<CR>` | Enter or Return. |
| `<Esc>` | Escape. |
| `<C-x>` | Control plus x. |
| `<S-Left>` | Shift plus Left. |
| `{motion}` | Any movement command, such as `w`, `$`, `}`. |
| `{operator}{motion}` | Vim grammar, for example `dw`, `d$`, `y}`. |
| `!` after an Ex command | Force the command, often discarding unsaved changes. |
| `WORD` | A blank-separated word. `word` is punctuation-aware; `WORD` is whitespace-aware. |

## Mode Basics

| Key or command | Action |
| --- | --- |
| `<Esc>` | Return to Normal mode from Insert, Visual, or command-line modes. |
| `<C-c>` | Return to Normal mode; similar to Escape, but with some differences around abbreviations/events. |
| `i` | Insert before cursor. |
| `I` | Insert before first non-blank character in line. |
| `a` | Append after cursor. |
| `A` | Append at end of line. |
| `o` | Open new line below and enter Insert mode. |
| `O` | Open new line above and enter Insert mode. |
| `R` | Replace mode. |
| `gR` | Virtual Replace mode. |
| `v` | Characterwise Visual mode. |
| `V` | Linewise Visual mode. |
| `<C-v>` | Blockwise Visual mode. |
| `:` | Ex command-line mode. |
| `/` | Forward search command-line. |
| `?` | Backward search command-line. |
| `Q` | Replay the last recorded macro in current Neovim defaults. |
| `gQ` | Enter Ex mode. |

## Help and Discovery

| Key or command | Action |
| --- | --- |
| `:help` | Open help. |
| `:help {topic}` | Open help for a topic, option, key, or command. |
| `<C-]>` | Follow help tag under cursor. |
| `<C-t>` | Jump back from a help tag. |
| `<C-o>` | Older jump position. |
| `<C-i>` | Newer jump position. |
| `:helpgrep {pattern}` | Search help files and fill quickfix. |
| `:copen` | Open quickfix results from `:helpgrep`. |
| `:h quickref` | Official quick reference. |
| `:h index` | Index of commands. |
| `:h tutor` | Neovim tutor. |

## File Editing, Saving, and Quitting

| Key or command | Action |
| --- | --- |
| `:e {file}` | Edit file. |
| `:edit` | Reload current file. |
| `:edit!` | Reload current file and discard local changes. |
| `:enew` | New unnamed buffer. |
| `:find {file}` | Find file in `'path'` and edit it. |
| `gf` | Edit file name under cursor. |
| `]f` | Edit file name under cursor. |
| `<C-^>` | Switch to alternate file. |
| `:pwd` | Print current directory. |
| `:cd {dir}` | Change current directory. |
| `:cd -` | Change to previous directory. |
| `:file` | Show current file name and cursor position. |
| `:files` | Show alternate file names. |
| `:w` | Write current buffer. |
| `:write {file}` | Write to file. |
| `:w! {file}` | Force write to file. |
| `:up` | Write only if modified. |
| `:wa` | Write all changed buffers. |
| `:q` | Quit current window/buffer if safe. |
| `:q!` | Quit and discard changes in current buffer if needed. |
| `:qa` | Quit all if safe. |
| `:qa!` | Quit all and discard changes if needed. |
| `:wq` | Write and quit. |
| `:x` | Write if modified, then quit. |
| `ZZ` | Same idea as `:x`. |
| `ZQ` | Same idea as `:q!`. |
| `<C-z>` | Suspend Neovim. |

## File Exploration With Built-In Netrw

Open netrw by editing a directory: `nvim .`, `:edit .`, or one of the explore commands below.

| Command | Action |
| --- | --- |
| `:Explore` | Explore directory of current file. |
| `:Sexplore` | Open explorer in a horizontal split. |
| `:Vexplore` | Open explorer in a vertical split. |
| `:Hexplore` | Horizontal split explorer. |
| `:Lexplore` | Toggle left explorer. |
| `:Texplore` | Open explorer in a tab. |
| `:Rexplore` | Return to explorer. |
| `:Nexplore` | Vertical split explorer variant. |
| `:Pexplore` | Previous explorer variant. |
| `:Ntree` | Use tree mode with a selected root. |
| `:NetrwSettings` | Open netrw settings window. |

| Key in netrw | Action |
| --- | --- |
| `<F1>` | Netrw help. |
| `<CR>` | Enter directory or open file. |
| `-` | Go up one directory. |
| `i` | Cycle listing style: thin, long, wide, tree. |
| `I` | Toggle banner. |
| `a` | Cycle normal, hidden-list-only, and hide-matching modes. |
| `gh` | Quick toggle dotfiles. |
| `<C-h>` | Edit file hiding list. |
| `<C-l>` | Refresh directory listing. |
| `s` | Cycle sort by name, time, or size. |
| `r` | Reverse sort order. |
| `S` | Edit suffix priority for name sorting. |
| `qf` | Show file information. |
| `o` | Open file/directory in horizontal split. |
| `v` | Open file/directory in vertical split. |
| `t` | Open file/directory in a new tab. |
| `p` | Preview file. |
| `P` | Open in previously used window. |
| `x` | Open file with associated external program. |
| `X` | Execute file under cursor with `system()`. |
| `%` | Create a new file in current netrw directory. |
| `d` | Create directory. |
| `D` | Delete selected file/directory or marked files. |
| `<Del>` | Delete selected file/directory. |
| `R` | Rename selected file/directory or marked files. |
| `cd` | Make browsing directory the current directory. |
| `C` | Set editing window. |
| `gp` | Change local file permissions. |
| `gd` | Force treatment as directory. |
| `gf` | Force treatment as file. |
| `gn` | Make directory under cursor the top of tree. |
| `u` | Go to previous directory in netrw history. |
| `U` | Go forward in netrw history. |
| `mb` | Bookmark current directory. |
| `gb` | Go to bookmarked directory. |
| `qb` | List bookmarks and history. |
| `mf` | Mark file. |
| `mF` | Unmark files. |
| `mu` | Unmark all marked files. |
| `mr` | Mark files by shell-style pattern. |
| `mt` | Set current directory as marked-file target. |
| `mc` | Copy marked files to target directory. |
| `mm` | Move marked files to target directory. |
| `md` | Diff marked files. |
| `me` | Put marked files in argument list and edit them. |
| `mg` | Run `vimgrep` over marked files. |
| `mh` | Toggle marked file suffixes in hiding list. |
| `mT` | Run ctags on marked files. |
| `mv` | Run Vim command on marked files. |
| `mx` | Run shell command on marked files. |
| `mX` | Run shell command on marked files as one group. |
| `mz` | Compress/decompress marked files. |
| `qF` | Mark files using quickfix list. |
| `qL` | Mark files using location list. |
| `O` | Obtain file under cursor. |

## Core Movement

| Key | Action |
| --- | --- |
| `h` | Left. |
| `j` | Down. |
| `k` | Up. |
| `l` | Right. |
| `<Left>` | Left. |
| `<Down>` | Down. |
| `<Up>` | Up. |
| `<Right>` | Right. |
| `0` | First character of line. |
| `^` | First non-blank character of line. |
| `$` | End of line. |
| `g0` | First character of screen line. |
| `g^` | First non-blank character of screen line. |
| `g$` | End of screen line. |
| `gm` | Middle of screen line. |
| `gM` | Middle of text line. |
| `g_` | Last non-blank character of line. |
| `N\|` | Go to column N. |
| `gg` | First line, or line N with count. |
| `G` | Last line, or line N with count. |
| `N%` | Go to N percent through file. |
| `H` | Top of window. |
| `M` | Middle of window. |
| `L` | Bottom of window. |
| `go` | Go to byte offset N. |
| `gj` | Down by display line. |
| `gk` | Up by display line. |
| `+` | Down to first non-blank. |
| `-` | Up to first non-blank. |
| `_` | Down N-1 lines to first non-blank. |

## Character Search on a Line

| Key | Action |
| --- | --- |
| `f{char}` | Move to next `{char}` on the line. |
| `F{char}` | Move to previous `{char}` on the line. |
| `t{char}` | Move before next `{char}` on the line. |
| `T{char}` | Move after previous `{char}` on the line. |
| `;` | Repeat last `f`, `F`, `t`, or `T`. |
| `,` | Repeat last `f`, `F`, `t`, or `T` in the opposite direction. |

## Word, Sentence, Paragraph, and Section Movement

| Key | Action |
| --- | --- |
| `w` | Next word. |
| `W` | Next WORD. |
| `e` | End of word. |
| `E` | End of WORD. |
| `b` | Previous word. |
| `B` | Previous WORD. |
| `ge` | Previous end of word. |
| `gE` | Previous end of WORD. |
| `)` | Next sentence. |
| `(` | Previous sentence. |
| `}` | Next paragraph. |
| `{` | Previous paragraph. |
| `]]` | Next section start. |
| `[[` | Previous section start. |
| `][` | Next section end. |
| `[]` | Previous section end. |

## Matching and Programming Motions

| Key | Action |
| --- | --- |
| `%` | Jump to matching pair or preprocessor conditional. |
| `[(` | Previous unmatched `(`. |
| `[{` | Previous unmatched `{`. |
| `])` | Next unmatched `)`. |
| `]}` | Next unmatched `}`. |
| `[m` | Previous method start. |
| `[M` | Previous method end. |
| `]m` | Next method start. |
| `]M` | Next method end. |
| `[#` | Previous unmatched `#if` or `#else`. |
| `]#` | Next unmatched `#else` or `#endif`. |
| `[*` | Previous start of C-style comment. |
| `]*` | Next end of C-style comment. |
| `gd` | Go to local declaration under cursor. |
| `gD` | Go to global declaration under cursor. |

## Scrolling and View Position

| Key | Action |
| --- | --- |
| `<C-e>` | Scroll window down one line. |
| `<C-y>` | Scroll window up one line. |
| `<C-d>` | Scroll down half page. |
| `<C-u>` | Scroll up half page. |
| `<C-f>` | Page forward. |
| `<C-b>` | Page backward. |
| `zt` | Put current line at top. |
| `z<CR>` | Put current line at top. |
| `zz` | Center current line. |
| `z.` | Center current line. |
| `zb` | Put current line at bottom. |
| `z-` | Put current line at bottom. |
| `zh` | Scroll horizontally right. |
| `zl` | Scroll horizontally left. |
| `zH` | Scroll horizontally half screen right. |
| `zL` | Scroll horizontally half screen left. |
| `<C-l>` | Redraw screen. |

## Search and Substitute

| Key or command | Action |
| --- | --- |
| `/{pattern}<CR>` | Search forward. |
| `?{pattern}<CR>` | Search backward. |
| `/<CR>` | Repeat last search forward. |
| `?<CR>` | Repeat last search backward. |
| `n` | Repeat last search in same direction. |
| `N` | Repeat last search in opposite direction. |
| `*` | Search forward for identifier under cursor. |
| `#` | Search backward for identifier under cursor. |
| `g*` | Search forward for partial match under cursor. |
| `g#` | Search backward for partial match under cursor. |
| `:%s/old/new/g` | Replace all matches in file. |
| `:%s/old/new/gc` | Replace all matches with confirmation. |
| `:s/old/new/` | Replace first match on current line. |
| `:s/old/new/g` | Replace all matches on current line. |
| `&` | Repeat previous substitute on current line without flags. |
| `:vimgrep /pat/g **/*` | Search files with internal grep and fill quickfix. |
| `:grep {args}` | Run external grep program and fill quickfix. |
| `:nohlsearch` | Clear search highlight. |

Useful search pattern atoms:

| Pattern | Meaning |
| --- | --- |
| `.` | Any single character. |
| `^` | Start of line. |
| `$` | End of line. |
| `\<` | Start of word. |
| `\>` | End of word. |
| `\s` | Whitespace. |
| `\S` | Non-whitespace. |
| `*` | Zero or more of previous atom. |
| `\+` | One or more of previous atom. |
| `\=` | Zero or one of previous atom. |
| `\{2,5}` | Two to five of previous atom. |
| `\|` | Pattern alternative. |
| `\(...\)` | Group pattern. |

## Marks, Jump List, and Change List

| Key or command | Action |
| --- | --- |
| `m{a-zA-Z}` | Set mark. |
| `` `{mark}` `` | Jump to exact mark position. |
| `'{mark}` | Jump to mark line, first non-blank. |
| `` `` `` | Jump to position before last jump. |
| `''` | Jump to line before last jump. |
| `` `0 `` | Position where Neovim last exited. |
| `` `" `` | Position when last editing this file. |
| `` `[ `` | Start of last changed or put text. |
| `` `] `` | End of last changed or put text. |
| `` `< `` | Start of last Visual selection. |
| `` `> `` | End of last Visual selection. |
| `` `. `` | Position of last change. |
| `:marks` | Show active marks. |
| `:delmarks {marks}` | Delete marks. |
| `<C-o>` | Older cursor position in jump list. |
| `<C-i>` | Newer cursor position in jump list. |
| `:jumps` | Show jump list. |
| `g;` | Older position in change list. |
| `g,` | Newer position in change list. |
| `:changes` | Show change list. |

## Operators: The Core Vim Grammar

Operators combine with motions and text objects. For example, `daw` deletes a word, `ci"` changes inside quotes, and `y}` yanks to next paragraph.

| Operator | Action |
| --- | --- |
| `d{motion}` | Delete over motion. |
| `c{motion}` | Change over motion. |
| `y{motion}` | Yank over motion. |
| `>{motion}` | Indent right. |
| `<{motion}` | Indent left. |
| `gq{motion}` | Format text. |
| `gw{motion}` | Format text and keep cursor. |
| `g~{motion}` | Toggle case. |
| `gu{motion}` | Lowercase. |
| `gU{motion}` | Uppercase. |
| `g?{motion}` | ROT13. |
| `!{motion}{cmd}` | Filter through external command. |
| `={motion}` | Reindent using equalprg or built-in indent. |

Common doubled operators:

| Key | Action |
| --- | --- |
| `dd` | Delete line. |
| `cc` | Change line. |
| `yy` | Yank line. |
| `Y` | Yank line. |
| `>>` | Indent line right. |
| `<<` | Indent line left. |
| `gqq` | Format current line. |
| `gww` | Format current line and keep cursor. |
| `g~~` | Toggle case on current line. |
| `guu` | Lowercase current line. |
| `gUU` | Uppercase current line. |
| `!!{cmd}` | Filter current line through command. |
| `==` | Reindent current line. |

## Text Objects

Use these after an operator or in Visual mode. Examples: `ciw`, `daw`, `yi"`, `va)`.

| Text object | Action |
| --- | --- |
| `aw` | A word. |
| `iw` | Inner word. |
| `aW` | A WORD. |
| `iW` | Inner WORD. |
| `as` | A sentence. |
| `is` | Inner sentence. |
| `ap` | A paragraph. |
| `ip` | Inner paragraph. |
| `al` | All lines. |
| `il` | Inner line. |
| `ab` | A `()` block. |
| `ib` | Inner `()` block. |
| `aB` | A `{}` block. |
| `iB` | Inner `{}` block. |
| `a>` | A `<>` block. |
| `i>` | Inner `<>` block. |
| `at` | A tag block. |
| `it` | Inner tag block. |
| `a'` | A single-quoted string. |
| `i'` | Inner single-quoted string. |
| `a"` | A double-quoted string. |
| `i"` | Inner double-quoted string. |
| `` a` `` | A backtick string. |
| `` i` `` | Inner backtick string. |

## Deleting, Changing, Replacing, Joining

| Key | Action |
| --- | --- |
| `x` | Delete character under cursor. |
| `X` | Delete character before cursor. |
| `D` | Delete to end of line. |
| `s` | Substitute character(s). |
| `S` | Substitute line(s). |
| `C` | Change to end of line. |
| `r{char}` | Replace character(s) with char. |
| `gr{char}` | Replace without affecting layout. |
| `J` | Join lines with spacing. |
| `gJ` | Join lines without inserting spaces. |
| `~` | Toggle case and move right. |
| `<C-a>` | Add to number under/after cursor. |
| `<C-x>` | Subtract from number under/after cursor. |

## Yank, Put, Registers, and Clipboard

| Key or command | Action |
| --- | --- |
| `y{motion}` | Yank text. |
| `yy` | Yank line. |
| `Y` | Yank line. |
| `p` | Put after cursor/line. |
| `P` | Put before cursor/line. |
| `]p` | Put after and adjust indent. |
| `[p` | Put before and adjust indent. |
| `gp` | Put after and leave cursor after new text. |
| `gP` | Put before and leave cursor after new text. |
| `"{reg}{op}` | Use register for next delete/yank/put. |
| `:reg` | Show registers. |
| `:reg {names}` | Show selected registers. |
| `"+y` | Yank to system clipboard when clipboard provider is available. |
| `"+p` | Paste from system clipboard when clipboard provider is available. |
| `"*y` | Yank to primary selection on systems that support it. |
| `"*p` | Paste from primary selection on systems that support it. |

Useful registers:

| Register | Meaning |
| --- | --- |
| `"` | Unnamed register. |
| `0` | Last yank register. |
| `1` to `9` | Delete history registers. |
| `-` | Small delete register. |
| `_` | Black-hole register. |
| `+` | System clipboard register. |
| `*` | Primary selection register. |
| `.` | Last inserted text. |
| `%` | Current file name. |
| `#` | Alternate file name. |
| `:` | Last command-line. |
| `/` | Last search pattern. |
| `=` | Expression register. |

## Insert Mode Editing

| Key | Action |
| --- | --- |
| `<Esc>` | Leave Insert mode. |
| `<C-c>` | Leave Insert mode. |
| `<C-o>{cmd}` | Run one Normal command, then return to Insert mode. |
| `<BS>` | Delete character before cursor. |
| `<Del>` | Delete character under cursor. |
| `<C-w>` | Delete word before cursor. |
| `<C-u>` | Delete entered text back to start of line. |
| `<C-t>` | Increase indent. |
| `<C-d>` | Decrease indent. |
| `0<C-d>` | Remove all indent on current line. |
| `^<C-d>` | Remove all indent on current line and restore it on next line. |
| `<C-r>{reg}` | Insert register contents. |
| `<C-v>{char}` | Insert character literally. |
| `<C-k>{char1}{char2}` | Insert digraph. |
| `<C-y>` | Insert character from line above. |
| `<C-e>` | Insert character from line below. |
| `<C-a>` | Insert previously inserted text. |
| `<C-@>` | Insert previously inserted text and leave Insert mode. |
| `<C-n>` | Next keyword completion match. |
| `<C-p>` | Previous keyword completion match. |

## Insert Mode Completion

| Key | Completion source |
| --- | --- |
| `<C-n>` | Next match from `'complete'`. |
| `<C-p>` | Previous match from `'complete'`. |
| `<C-x><C-l>` | Whole lines. |
| `<C-x><C-n>` | Keywords in current file, forward. |
| `<C-x><C-p>` | Keywords in current file, backward. |
| `<C-x><C-k>` | Dictionary. |
| `<C-x><C-t>` | Thesaurus. |
| `<C-x><C-i>` | Current and included files. |
| `<C-x><C-]>` | Tags. |
| `<C-x><C-f>` | File names. |
| `<C-x><C-d>` | Definitions or macros. |
| `<C-x><C-v>` | Vim command-line. |
| `<C-x><C-u>` | User-defined completion. |
| `<C-x><C-o>` | Omni completion. |
| `<C-x>s` | Spelling suggestions. |
| `<C-x><C-s>` | Spelling suggestions, terminal permitting. |
| `<C-x><C-r>` | Register contents. |
| `<C-x><C-z>` | Stop completion without changing text. |

## Visual Mode

| Key | Action |
| --- | --- |
| `v` | Start/stop characterwise Visual mode. |
| `V` | Start/stop linewise Visual mode. |
| `<C-v>` | Start/stop blockwise Visual mode. |
| `o` | Move cursor to other end of selection. |
| `gv` | Reselect previous Visual area. |
| `d` | Delete selection. |
| `c` | Change selection. |
| `y` | Yank selection. |
| `>` | Indent selection right. |
| `<` | Indent selection left. |
| `=` | Reindent selection. |
| `~` | Toggle case. |
| `u` | Lowercase. |
| `U` | Uppercase. |
| `g?` | ROT13. |
| `J` | Join selected lines. |
| `gJ` | Join selected lines without spaces. |
| `!{cmd}` | Filter selected lines through command. |
| `I` in block mode | Insert same text before selected columns. |
| `A` in block mode | Append same text after selected columns. |
| `r{char}` in block mode | Replace selected block characters. |
| `c` in block mode | Change selected block. |
| `C` in block mode | Change selected block through line ends. |

## Repeat, Macros, and Global Commands

| Key or command | Action |
| --- | --- |
| `.` | Repeat last change. |
| `q{a-z}` | Record macro into register. |
| `q{A-Z}` | Append recorded macro into register. |
| `q` while recording | Stop recording. |
| `@{reg}` | Execute macro/register. |
| `@@` | Repeat previous macro. |
| `Q` | Replay last recorded macro. |
| `:@{reg}` | Execute register as Ex commands. |
| `:@@` | Repeat previous `:@`. |
| `:g/{pattern}/{cmd}` | Run command on matching lines. |
| `:g!/{pattern}/{cmd}` | Run command on non-matching lines. |
| `:v/{pattern}/{cmd}` | Same idea as `:g!`. |
| `:source {file}` | Read Ex commands from file. |
| `:source! {file}` | Read Normal-mode commands from file. |

## Undo and Redo

| Key or command | Action |
| --- | --- |
| `u` | Undo. |
| `<C-r>` | Redo. |
| `U` | Restore last changed line. |
| `:earlier {time}` | Go to older text state. |
| `:later {time}` | Go to newer text state. |
| `:undolist` | Show undo branches. |

## Buffers

| Command | Action |
| --- | --- |
| `:buffers` | List buffers. |
| `:files` | List buffers/files. |
| `:badd {file}` | Add file to buffer list. |
| `:buffer {N}` | Go to buffer N. |
| `:bnext` | Next buffer. |
| `:bprevious` | Previous buffer. |
| `:bNext` | Previous buffer. |
| `:bfirst` | First buffer. |
| `:blast` | Last buffer. |
| `:bmodified` | Next modified buffer. |
| `:bunload` | Unload buffer. |
| `:bdelete` | Delete buffer from buffer list. |
| `:ball` | Open windows for all buffers/args. |
| `:unhide` | Open windows for loaded buffers. |

## Argument List

| Command | Action |
| --- | --- |
| `:args` | Print argument list. |
| `:next` | Next argument. |
| `:Next` | Previous argument. |
| `:previous` | Previous argument. |
| `:first` | First argument. |
| `:last` | Last argument. |
| `:argument N` | Go to argument N. |
| `:all` | Open window for every argument. |
| `:wnext` | Write current file and edit next argument. |
| `:wNext` | Write current file and edit previous argument. |

## Windows and Splits

| Key or command | Action |
| --- | --- |
| `<C-w>s` | Horizontal split. |
| `:split {file}` | Horizontal split and edit file. |
| `<C-w>v` | Vertical split. |
| `:vsplit {file}` | Vertical split and edit file. |
| `<C-w>n` | New empty window. |
| `:new` | New empty window. |
| `:vnew` | New empty vertical window. |
| `<C-w>q` | Quit window. |
| `<C-w>c` | Close window. |
| `<C-w>o` | Only current window. |
| `<C-w>h` | Move to window left. |
| `<C-w>j` | Move to window below. |
| `<C-w>k` | Move to window above. |
| `<C-w>l` | Move to window right. |
| `<C-w>w` | Move to next window. |
| `<C-w>W` | Move to previous window. |
| `<C-w>t` | Move to top-left window. |
| `<C-w>b` | Move to bottom-right window. |
| `<C-w>p` | Move to previous active window. |
| `<C-w>r` | Rotate windows down/right. |
| `<C-w>R` | Rotate windows up/left. |
| `<C-w>x` | Exchange current window with next/window N. |
| `<C-w>H` | Move current window far left. |
| `<C-w>J` | Move current window to bottom. |
| `<C-w>K` | Move current window to top. |
| `<C-w>L` | Move current window far right. |
| `<C-w>T` | Move current window to new tab. |
| `<C-w>=` | Equalize window sizes. |
| `<C-w>-` | Decrease height. |
| `<C-w>+` | Increase height. |
| `<C-w>_` | Set height, default maximum. |
| `<C-w><` | Decrease width. |
| `<C-w>>` | Increase width. |
| `<C-w>\|` | Set width, default maximum. |
| `<C-w>]` | Split and jump to tag under cursor. |
| `<C-w>}` | Preview tag under cursor. |
| `<C-w>f` | Split and edit file name under cursor. |
| `<C-w>^` | Split and edit alternate file. |
| `:wincmd {key}` | Run a `<C-w>` window command from Ex mode. |

## Tabs

A tabpage is a layout of one or more windows, not just a file tab.

| Key or command | Action |
| --- | --- |
| `:tabnew` | New tab. |
| `:tabedit {file}` | Edit file in new tab. |
| `:tabfind {file}` | Find file in `'path'` and open in new tab. |
| `:tab split` | Open current buffer in new tab. |
| `<C-w>gf` | Open file under cursor in new tab. |
| `<C-w>gF` | Open file under cursor in new tab and jump to line. |
| `gt` | Next tab. |
| `gT` | Previous tab. |
| `{N}gt` | Go to tab N. |
| `{N}gT` | Go N tabs backward. |
| `<C-PageDown>` | Next tab. |
| `<C-PageUp>` | Previous tab. |
| `g<Tab>` | Last accessed tab. |
| `<C-w>g<Tab>` | Last accessed tab. |
| `:tabnext` | Next tab. |
| `:tabprevious` | Previous tab. |
| `:tabfirst` | First tab. |
| `:tablast` | Last tab. |
| `:tabs` | List tabs and their windows. |
| `:tabclose` | Close current tab. |
| `:tabonly` | Close all other tabs. |
| `:tabmove {N}` | Move current tab after tab N. |
| `:tabdo {cmd}` | Run command in each tab. |

## Quickfix and Location Lists

Quickfix is global. Location lists are per-window. Many location list commands replace the `c` in quickfix with `l`.

| Key or command | Action |
| --- | --- |
| `:make` | Run make program and fill quickfix. |
| `:grep {args}` | Run grep program and fill quickfix. |
| `:vimgrep /pat/g files` | Internal grep and fill quickfix. |
| `:copen` | Open quickfix window. |
| `:cclose` | Close quickfix window. |
| `:cwindow` | Open quickfix window only when there are entries; close otherwise. |
| `:cc {N}` | Go to quickfix item N. |
| `:cnext` | Next quickfix item. |
| `:cprevious` | Previous quickfix item. |
| `:cfirst` | First quickfix item. |
| `:clast` | Last quickfix item. |
| `]q` | Next quickfix item. |
| `[q` | Previous quickfix item. |
| `]<C-q>` | Next quickfix file. |
| `[<C-q>` | Previous quickfix file. |
| `:colder` | Older quickfix list. |
| `:cnewer` | Newer quickfix list. |
| `:cdo {cmd}` | Run command for each quickfix item. |
| `:cfdo {cmd}` | Run command for each quickfix file. |
| `:lopen` | Open location list. |
| `:lclose` | Close location list. |
| `:lwindow` | Open location list only when there are entries; close otherwise. |
| `:ll {N}` | Go to location item N. |
| `:lnext` | Next location item. |
| `:lprevious` | Previous location item. |
| `]l` | Next location item. |
| `[l` | Previous location item. |
| `]<C-l>` | Next location file. |
| `[<C-l>` | Previous location file. |
| `:lolder` | Older location list. |
| `:lnewer` | Newer location list. |
| `:ldo {cmd}` | Run command for each location item. |
| `:lfdo {cmd}` | Run command for each location file. |

## Tags

| Key or command | Action |
| --- | --- |
| `:tag {tag}` | Jump to tag. |
| `<C-]>` | Jump to tag under cursor. |
| `g<C-]>` | List matching tags for tag under cursor. |
| `:tselect {tag}` | List matching tags and select one. |
| `:tjump {tag}` | Jump or select when ambiguous. |
| `:tags` | Show tag stack. |
| `<C-t>` | Pop tag stack. |
| `:pop` | Pop tag stack. |
| `:tnext` | Next matching tag. |
| `:tprevious` | Previous matching tag. |
| `:trewind` | First matching tag. |
| `:tlast` | Last matching tag. |
| `:ptag {tag}` | Open preview window for tag. |
| `<C-w>}` | Preview tag under cursor. |
| `:pclose` | Close preview window. |
| `<C-w>z` | Close preview window. |

## Built-In LSP Defaults

These are stock Neovim LSP defaults. They depend on an LSP client/server being active and the server supporting the feature.

| Key or command | Action |
| --- | --- |
| `gra` | Code action, Normal and Visual mode. |
| `gri` | Go to implementation. |
| `grn` | Rename symbol. |
| `grr` | References. |
| `grt` | Type definition. |
| `grx` | Run code lens. |
| `gO` | Document symbols. |
| `K` | Hover, when LSP attaches and `K` was not otherwise customized. |
| `<C-s>` in Insert mode | Signature help. |
| `<C-]>` | Uses LSP tag function for go-to-definition when LSP sets `tagfunc`. |
| `<C-w>]` | Split and jump using LSP tag function when available. |
| `<C-w>}` | Preview definition using LSP tag function when available. |
| `gq{motion}` | Formats through LSP when LSP sets `formatexpr`. |
| `<C-x><C-o>` | Omni completion through LSP when LSP sets `omnifunc`. |
| `:checkhealth vim.lsp` | Check LSP status. |
| `:lsp enable {name}` | Enable LSP config. |
| `:lsp disable {name}` | Disable LSP config. |
| `:lsp restart {name}` | Restart active LSP client/server. |
| `:lsp stop {name}` | Stop active LSP client/server. |

## Diagnostics

| Key or command | Action |
| --- | --- |
| `]d` | Next diagnostic. |
| `[d` | Previous diagnostic. |
| `]D` | Last diagnostic. |
| `[D` | First diagnostic. |
| `<C-w>d` | Show diagnostic at cursor in floating window. |
| `:lua vim.diagnostic.open_float()` | Open diagnostic float manually. |
| `:lua vim.diagnostic.setloclist()` | Put diagnostics in location list. |
| `:lua vim.diagnostic.setqflist()` | Put diagnostics in quickfix list. |

## Folding

| Key or command | Action |
| --- | --- |
| `zf{motion}` | Create manual fold. |
| `:{range}fold` | Create fold for range. |
| `zd` | Delete fold under cursor. |
| `zD` | Delete all folds under cursor. |
| `zo` | Open fold under cursor. |
| `zO` | Open all folds under cursor. |
| `zc` | Close fold under cursor. |
| `zC` | Close all folds under cursor. |
| `za` | Toggle fold under cursor. |
| `zA` | Toggle all folds under cursor. |
| `zv` | Open enough folds to view cursor line. |
| `zm` | Fold more. |
| `zM` | Close all folds. |
| `zr` | Reduce folding. |
| `zR` | Open all folds. |
| `zn` | Disable folding. |
| `zN` | Enable folding. |
| `zi` | Toggle folding globally for window. |
| `:set foldmethod=manual` | Manual folds. |
| `:set foldmethod=indent` | Fold by indent. |
| `:set foldmethod=expr` | Fold by expression. |
| `:set foldmethod=syntax` | Fold by syntax. |
| `:set foldmethod=marker` | Fold by markers. |

## Terminal Mode

| Key or command | Action |
| --- | --- |
| `:terminal` | Open terminal buffer. |
| `:terminal {cmd}` | Run command in terminal buffer. |
| `:edit term://bash` | Edit terminal buffer directly. |
| `i`, `I`, `a`, `A` | Enter Terminal-mode from terminal Normal mode. |
| `:startinsert` | Enter Terminal-mode/Insert-like input mode. |
| `<C-\><C-n>` | Leave Terminal-mode and enter Normal mode. |
| `<C-\><C-o>` | Run one Normal command and return to Terminal-mode. |

## Spell Checking

| Key or command | Action |
| --- | --- |
| `:set spell` | Enable spell checking. |
| `:set nospell` | Disable spell checking. |
| `]s` | Next misspelled word. |
| `[s` | Previous misspelled word. |
| `]S` | Next bad word only. |
| `[S` | Previous bad word only. |
| `]r` | Next rare word. |
| `[r` | Previous rare word. |
| `z=` | Suggest corrections. |
| `1z=` | Use first spelling suggestion. |
| `zg` | Add word as good word to spellfile. |
| `zG` | Add word as good word to internal word list. |
| `zw` | Mark word as wrong in spellfile. |
| `zW` | Mark word as wrong internally. |
| `zug` or `zuw` | Undo `zg` or `zw` in spellfile. |
| `zuG` or `zuW` | Undo `zG` or `zW` internally. |
| `<C-x>s` in Insert mode | Spell suggestions completion. |

## Diff Mode

| Key or command | Action |
| --- | --- |
| `nvim -d file1 file2` | Start in diff mode. |
| `:diffsplit {file}` | Open file in diff split. |
| `:vertical diffsplit {file}` | Open file in vertical diff split. |
| `:diffthis` | Make current window part of diff. |
| `:diffoff` | Turn off diff in current window. |
| `:diffoff!` | Turn off diff in all diff windows in current tab. |
| `:diffupdate` | Update diff highlighting/folds. |
| `]c` | Next diff change. |
| `[c` | Previous diff change. |
| `do` | Obtain change from other buffer; same as `:diffget`. |
| `dp` | Put change into other buffer; same as `:diffput`. |
| `:diffget` | Get diff from another buffer. |
| `:diffput` | Put diff into another buffer. |

## Command-Line Editing

| Key | Action |
| --- | --- |
| `<Esc>` | Abandon command-line. |
| `<C-c>` | Abandon command-line. |
| `<C-v>{char}` | Insert literal character. |
| `<C-k>{char1}{char2}` | Insert digraph. |
| `<C-r>{reg}` | Insert register contents. |
| `<Left>` / `<Right>` | Move one character. |
| `<S-Left>` / `<S-Right>` | Move one word. |
| `<C-b>` | Beginning of command-line. |
| `<C-e>` | End of command-line. |
| `<BS>` | Delete character before cursor. |
| `<Del>` | Delete character under cursor. |
| `<C-w>` | Delete word before cursor. |
| `<C-u>` | Delete from cursor to start of command-line. |
| `<Up>` / `<Down>` | Recall older/newer command-line matching current prefix. |
| `<S-Up>` / `<S-Down>` | Recall older/newer command-line from history. |
| `<Tab>` | Command-line completion. |
| `<C-d>` | List matching completions. |
| `<C-a>` | Insert all matches. |
| `<C-l>` | Insert longest common completion prefix. |
| `<C-n>` | Next completion after wildcard completion. |
| `<C-p>` | Previous completion after wildcard completion. |
| `<C-g>` | Next incremental search match. |
| `<C-t>` | Previous incremental search match. |
| `:history` | Show command-line history. |

## Ex Ranges and File Tokens

| Syntax | Meaning |
| --- | --- |
| `.` | Current line. |
| `$` | Last line. |
| `%` | Whole file, equivalent to `1,$`. |
| `'<,'>` | Last Visual selection range. |
| `*` | Visual selection range in Ex command context. |
| `{number}` | Absolute line number. |
| `+N` | N lines after previous address. |
| `-N` | N lines before previous address. |
| `/{pattern}/` | Next line matching pattern. |
| `?{pattern}?` | Previous line matching pattern. |
| `:1,10d` | Delete lines 1 through 10. |
| `:%s/a/b/g` | Substitute in whole file. |
| `%` where a file is expected | Current file name. |
| `#` where a file is expected | Alternate file name. |
| `<cword>` | Word under cursor. |
| `<cWORD>` | WORD under cursor. |
| `<cfile>` | File name under cursor. |
| `%:p` | Current file full path. |
| `%:h` | Current file directory/head. |
| `%:t` | Current file tail/name. |
| `%:r` | Current file root without extension. |
| `%:e` | Current file extension. |

## Options and Mapping Commands Worth Knowing Before Plugins

| Command | Action |
| --- | --- |
| `:set` | Show modified options. |
| `:set all` | Show all options. |
| `:set {option}` | Enable boolean option or show non-boolean option. |
| `:set no{option}` | Disable boolean option. |
| `:set inv{option}` | Invert boolean option. |
| `:set {option}?` | Show option value. |
| `:set {option}&` | Reset option to default. |
| `:setlocal` | Set local option. |
| `:setglobal` | Set global option. |
| `:options` | Browse options interactively. |
| `:map` | List mappings. |
| `:nmap` | List Normal mappings. |
| `:imap` | List Insert mappings. |
| `:vmap` | List Visual mappings. |
| `:map {lhs} {rhs}` | Map in Normal/Visual modes. |
| `:noremap {lhs} {rhs}` | Non-recursive map. |
| `:unmap {lhs}` | Remove mapping. |
| `:mapclear` | Clear mappings for Normal/Visual modes. |
| `:iabbrev {lhs} {rhs}` | Insert-mode abbreviation. |
| `:cabbrev {lhs} {rhs}` | Command-line abbreviation. |
| `:mksession {file}` | Save session. |

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
