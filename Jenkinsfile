pipeline {
    agent any

    environment {
        DOCKERHUB_CREDS   = 'dockerhub-credentials'
        DOCKERHUB_USER    = 'fitisol'
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

        stage('Build Images') {
            parallel {
                stage('Build backend') {
                    steps {
                        script {
                            docker.build("fitisol/callora-backend:${IMAGE_TAG}", "./backend")
                        }
                    }
                }
                stage('Build frontend') {
                    steps {
                        script {
                            docker.build("fitisol/callora-frontend:${IMAGE_TAG}", "./frontend")
                        }
                    }
                }
                stage('Build admin') {
                    steps {
                        script {
                            docker.build("fitisol/callora-admin:${IMAGE_TAG}", "./admin")
                        }
                    }
                }
            }
        }

        stage('Push Images') {
            steps {
                script {
                    docker.withRegistry('https://index.docker.io/v1/', 'dockerhub-credentials') {
                        ['callora-backend', 'callora-frontend', 'callora-admin'].each { name ->
                            def img = docker.image("fitisol/${name}:${IMAGE_TAG}")
                            img.push("${IMAGE_TAG}")
                            img.push('latest')
                        }
                    }
                }
            }
        }

        stage('Setup Server') {
            steps {
                sshagent(credentials: ['server-ssh-key']) {
                    sh """
                        ssh -o StrictHostKeyChecking=no ubuntu@54.255.170.154 '
                            sudo mkdir -p /opt/callora
                            sudo chown ubuntu:ubuntu /opt/callora
                        '
                    """
                    sh "scp -o StrictHostKeyChecking=no docker-compose.yml ubuntu@54.255.170.154:/opt/callora/docker-compose.yml"
                }
            }
        }

        stage('Deploy') {
            steps {
                sshagent(credentials: ['server-ssh-key']) {
                    withCredentials([usernamePassword(
                        credentialsId: 'dockerhub-credentials',
                        usernameVariable: 'DH_USER',
                        passwordVariable: 'DH_PASS'
                    )]) {
                        sh """
                            ssh -o StrictHostKeyChecking=no ubuntu@54.255.170.154 '
                                set -e
                                cd /opt/callora
                                echo "$DH_PASS" | docker login -u "$DH_USER" --password-stdin
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

        stage('Health Check') {
            steps {
                sh '''
                    echo "Waiting for backend to start..."
                    sleep 15
                    for i in 1 2 3 4 5 6 7 8 9 10; do
                        echo "Attempt $i..."
                        RESPONSE=$(curl -sf http://54.255.170.154:4000/health || true)
                        echo "Response: $RESPONSE"
                        if echo "$RESPONSE" | grep -q '"status":"ok"'; then
                            echo "Health check passed!"
                            exit 0
                        fi
                        sleep 10
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
            cleanWs()
        }
        failure {
            echo "PIPELINE FAILED — check logs"
        }
        success {
            echo "DEPLOYED SUCCESSFULLY — Callora is live!"
        }
    }
}