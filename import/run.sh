SCRIPT_TO_RUN=$1
if [ -z "${SCRIPT_TO_RUN}" ]; then
	echo "call run.sh script with parameter eg import.js"
	exit 1
fi
 
read -s  -p "enter Mongo-Admin password:" pwd
mongo ds155490.mlab.com:55490/esko-bot-db -u admin -p $pwd ${SCRIPT_TO_RUN}
