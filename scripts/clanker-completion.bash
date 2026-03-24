# Tab completion för clanker (bash 4+ rekommenderas; fungerar utan bash-completion-paketet).
# Lägg i ~/.bashrc:
#   source /sökväg/till/Clanker/scripts/clanker-completion.bash
# Zsh: autoload -U bashcompinit && bashcompinit && source … samma fil

_clanker_complete() {
  local cur="${COMP_WORDS[COMP_CWORD]}"
  if ((COMP_CWORD == 1)); then
    COMPREPLY=( $(compgen -W "help run kill up stop down compose ps doctor dev" -- "$cur") )
    return
  fi

  local sub="${COMP_WORDS[1]}"
  case "$sub" in
    up)
      COMPREPLY=( $(compgen -W "discord devtools caddy db --no-build --build" -- "$cur") )
      ;;
    stop)
      COMPREPLY=( $(compgen -W "discord devtools caddy db" -- "$cur") )
      ;;
    down)
      COMPREPLY=( $(compgen -W "--volumes --remove-orphans" -- "$cur") )
      ;;
    dev)
      if ((COMP_CWORD == 2)); then
        COMPREPLY=( $(compgen -W "discord devtools --vite-only --no-build --build --up" -- "$cur") )
      elif ((COMP_CWORD >= 3)); then
        COMPREPLY=( $(compgen -W "discord devtools --vite-only --no-build --build --up" -- "$cur") )
      fi
      ;;
    compose | ps | doctor | run | kill | help)
      ;;
    *)
      ;;
  esac
}

complete -F _clanker_complete clanker
