call run-tsc
if  errorlevel 1 goto ERROR_TSC

call run-test
if  errorlevel 1 goto ERROR_TEST

call npm version patch --no-git-tag-version
call npm publish

ECHO  Publish Finished
goto SUCCESS

:ERROR_TSC
echo TSC FAILED

:ERROR_TEST
echo TEST FAILED

:SUCCESS