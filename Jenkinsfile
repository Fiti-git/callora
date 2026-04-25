pipeline {
    agent any

    environment {
        DOCKERHUB_CREDS   = 'dockerhub-credentials'
        DOCKERHUB_USER    = 'your-dockerhub-username'
        SERVER_SSH_CREDS  = 'server-ssh-key'
        SERVER_HOST       = '54.255.170.154'
        SERVER_USER       = 'ubuntu'
        IMAGE_TAG         = "${env.BUILD_NUMBER}"
    }

    options {
        timestamps()
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '20'))
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build backend image') {
            steps {
                script {
                    docker.build("${DOCKERHUB_USER}/callora-backend:${IMAGE_TAG}", "./backend")
                }
            }
        }

        stage('Build frontend image') {
            steps {
                script {
                    docker.build("${DOCKERHUB_USER}/callora-frontend:${IMAGE_TAG}", "./frontend")
                }
            }
        }

        stage('Build admin image') {
            steps {
                script {
                    docker.build("${DOCKERHUB_USER}/callora-admin:${IMAGE_TAG}", "./admin")
                }
            }
        }

        stage('Push images') {
            steps {
                script {
                    docker.withRegistry('https://index.docker.io/v1/', "${DOCKERHUB_CREDS}") {
                        ['callora-backend', 'callora-frontend', 'callora-admin'].each { name ->
                            def img = docker.image("${DOCKERHUB_USER}/${name}:${IMAGE_TAG}")
                            img.push("${IMAGE_TAG}")
                            img.push('latest')
                        }
                    }
                }
            }
        }

        stage('Deploy') {
            steps {
                sshagent(credentials: ["${SERVER_SSH_CREDS}"]) {
                    withCredentials([usernamePassword(
                        credentialsId: "${DOCKERHUB_CREDS}",
                        usernameVariable: 'DH_USER',
                        passwordVariable: 'DH_PASS'
                    )]) {
                        sh """
                            ssh -o StrictHostKeyChecking=no ${SERVER_USER}@${SERVER_HOST} '
                                set -e
                                cd /opt/callora
                                echo "\$DH_PASS" | docker login -u "\$DH_USER" --password-stdin
                                docker compose pull
                                docker compose up -d --remove-orphans
                                docker image prune -f
                                docker logout
                            '
                        """
                    }
                }
            }
        }

        stage('Health check') {
            steps {
                sh '''
                    set -e
                    for i in 1 2 3 4 5 6 7 8 9 10; do
                        echo "Health check attempt $i..."
                        RESPONSE=$(curl -sf http://''' + "${SERVER_HOST}" + ''':4000/health || true)
                        echo "Response: $RESPONSE"
                        if echo "$RESPONSE" | grep -q '"status":"ok"'; then
                            echo "Health check passed."
                            exit 0
                        fi
                        sleep 5
                    done
                    echo "Health check failed after 10 attempts."
                    exit 1
                '''
            }
        }
    }

    post {
        always {
            echo "Pipeline result: ${currentBuild.currentResult}"
        }
        failure {
            echo "PIPELINE FAILED — check logs"
        }
        success {
            echo "DEPLOYED SUCCESSFULLY"
        }
    }
}
