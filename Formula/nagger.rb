# Homebrew formula for Nagger.
#
# This is a template tap formula. On each tagged release, update `url` to point
# at the release tarball and set `sha256` to its checksum. Installs both the
# `nagger` binary and the `nag` alias; requires no Node at runtime (the binary
# is compiled with `bun build --compile`).
#
#   brew tap kevinsegal/nagger
#   brew install nagger
class Nagger < Formula
  desc "Process & deployment sentinel — nags you at progress milestones and on completion"
  homepage "https://github.com/kevinsegal/nagger"
  version "0.1.0"
  license "MIT"

  on_macos do
    on_arm do
      url "https://github.com/kevinsegal/nagger/releases/download/v0.1.0/nagger-macos-arm64.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
    on_intel do
      url "https://github.com/kevinsegal/nagger/releases/download/v0.1.0/nagger-macos-x64.tar.gz"
      sha256 "0000000000000000000000000000000000000000000000000000000000000000"
    end
  end

  on_linux do
    url "https://github.com/kevinsegal/nagger/releases/download/v0.1.0/nagger-linux-x64.tar.gz"
    sha256 "0000000000000000000000000000000000000000000000000000000000000000"
  end

  def install
    bin.install "nagger"
    # First-class short alias.
    bin.install_symlink bin/"nagger" => "nag"
  end

  test do
    assert_match "0.1.0", shell_output("#{bin}/nagger --version")
    assert_match "0.1.0", shell_output("#{bin}/nag --version")
  end
end
