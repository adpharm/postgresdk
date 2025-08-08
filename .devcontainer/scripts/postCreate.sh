#!/bin/bash

# exit on error
set -e

# install gemini cli
npx https://github.com/google-gemini/gemini-cli

# add taskfile completions to bashrc
# the command to generate completions is `eval "$(task --completion bash)"`
echo 'eval "$(task --completion bash)"' >>~/.bashrc

# source bashrc to load completions
source ~/.bashrc
