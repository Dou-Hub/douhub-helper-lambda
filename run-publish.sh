set -e
sh run-unlink.sh
sh run-tsc.sh
sh run-test.sh
npm version patch
npm publish