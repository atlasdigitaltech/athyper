#!/usr/bin/env bash
# =======================================================================
# Shared .env parsing helpers for stack scripts.
#
# read_env_value <file> <key>
#   - Robust against CRLF endings
#   - Strips surrounding single/double quotes
#   - Strips inline comments
#   - Ignores lines with leading BOM
#   - Supports quoted keys/values and whitespace around delimiters
# =======================================================================

if [[ "${_ATHYPER_ENV_PARSE_LOADED:-}" == "1" ]]; then
  return 0
fi
_ATHYPER_ENV_PARSE_LOADED=1

read_env_value() {
  local _file="${1:?read_env_value: FILE argument required}"
  local _key="${2:?read_env_value: KEY argument required}"
  local _line _parsed_key _value

  [[ -f "$_file" ]] || return 1

  # 3-byte UTF-8 BOM (EF BB BF) \u2014 explicit byte form so this works under any locale.
  local _bom=$'\xef\xbb\xbf'

  while IFS= read -r _line || [[ -n "$_line" ]]; do
    _line="${_line//$'\r'/}"
    # Strip BOM if present at the very start of the line (only first line in practice).
    _line="${_line#"$_bom"}"
    _line="${_line#"${_line%%[![:space:]]*}"}"
    _line="${_line%"${_line##*[![:space:]]}"}"
    [[ -z "$_line" ]] && continue
    [[ "${_line:0:1}" == "#" ]] && continue

    _parsed_key="${_line%%=*}"
    [[ "$_parsed_key" == "${_line}" ]] && continue

    _parsed_key="${_parsed_key#"${_parsed_key%%[![:space:]]*}"}"
    _parsed_key="${_parsed_key%"${_parsed_key##*[![:space:]]}"}"
    [[ "$_parsed_key" == "$_key" ]] || continue

    _value="${_line#*=}"
    [[ "${_value:0:1}" == "#" ]] && continue
    _value="${_value#"${_value%%[![:space:]]*}"}"
    _value="${_value%"${_value##*[![:space:]]}"}"

    if [[ ${#_value} -ge 2 ]]; then
      if [[ "${_value:0:1}" == '"' && "${_value: -1}" == '"' ]]; then
        _value="${_value:1:${#_value}-2}"
      elif [[ "${_value:0:1}" == "'" && "${_value: -1}" == "'" ]]; then
        _value="${_value:1:${#_value}-2}"
      elif [[ "$_value" == *"#"* ]]; then
        # Inline comment \u2014 strip and re-rtrim (space before # would otherwise survive).
        _value="${_value%%#*}"
        _value="${_value%"${_value##*[![:space:]]}"}"
      fi
    elif [[ "$_value" == *"#"* ]]; then
      _value="${_value%%#*}"
      _value="${_value%"${_value##*[![:space:]]}"}"
    fi

    echo "$_value"
    return 0
  done < "$_file"

  return 1
}
