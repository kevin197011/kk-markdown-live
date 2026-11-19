# frozen_string_literal: true

# Copyright (c) 2025 kk
#
# This software is released under the MIT License.
# https://opensource.org/licenses/MIT
#
#   rake run           # compile + package + install VSIX (Cursor / VS Code)
#   rake push          # auto commit + pull + push
#   KK_GIT_DRY_RUN=1 rake push

begin
  require 'bundler/setup'
rescue LoadError
  # kk-git installed globally
end
require 'kk/git/rake_tasks'

task default: %w[push]

desc 'Compile, package, and install the VSIX into Cursor / VS Code'
task :run do
  sh 'npm', 'install'
  sh 'npm', 'run', 'package'
  vsix = Dir['kk-markdown-live-*.vsix'].max_by { |f| File.mtime(f) }
  abort 'no kk-markdown-live-*.vsix after package' unless vsix

  if system('which', 'cursor', out: File::NULL, err: File::NULL)
    sh 'cursor', '--install-extension', vsix, '--force'
  end
  if system('which', 'code', out: File::NULL, err: File::NULL)
    sh 'code', '--install-extension', vsix, '--force'
  end
  puts "installed #{vsix}"
end

desc 'Auto commit, pull, push'
task :push do
  Rake::Task['git:auto_commit_push'].invoke
end
