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

        // -----------------------------------------------------------------
        // Test + migration-drift gate.
        //
        // These stages run BEFORE we build/push images so a regression or a
        // schema-vs-migrations drift fails the pipeline early — no broken
        // code or partial migration ever reaches the Push or Deploy stages.
        //
        // The Test stage runs the same vitest suites covered by GitHub
        // Actions CI. It uses Docker so the agent doesn't need Node/Postgres
        // installed locally. The DB is a throwaway container scoped to the
        // build so it can't pollute (or be polluted by) anything else.
        //
        // The Migration Drift Check guards against `schema.prisma` being
        // edited without a matching migration committed. `prisma migrate
        // diff --exit-code` returns non-zero on any drift.
        // -----------------------------------------------------------------
        stage('Test') {
            agent {
                docker {
                    image 'node:20'
                    reuseNode true
                    args '--user 0:0'
                }
            }
            environment {
                DATABASE_URL        = "postgres://postgres:postgres@ci-pg-${env.BUILD_NUMBER}:5432/callora_test"
                NEXTAUTH_SECRET     = "ci0000000000000000000000000000000000000000000000000000000000ci00"
                PLATFORM_JWT_SECRET = "ci1111111111111111111111111111111111111111111111111111111111ci11"
                VAPI_WEBHOOK_SECRET = "ci2222222222222222222222222222222222222222222222222222222222ci22"
                TENANT_APP_ORIGIN   = "http://localhost:3000"
                REDIS_URL           = "redis://ci-redis-${env.BUILD_NUMBER}:6379"
                CALLING_SERVICE_URL = "http://localhost:4004"
                NOTIFICATION_SERVICE_URL = "http://localhost:4008"
                LEAD_SERVICE_URL    = "http://localhost:4003"
                NODE_ENV            = "test"
            }
            steps {
                script {
                    docker.image('postgres:16').withRun(
                        "--name ci-pg-${env.BUILD_NUMBER} -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=callora_test"
                    ) { _pg ->
                        docker.image('redis:7').withRun(
                            "--name ci-redis-${env.BUILD_NUMBER}"
                        ) { _redis ->
                            sh '''
                                set -e
                                # Wait for Postgres
                                for i in 1 2 3 4 5 6 7 8 9 10; do
                                    pg_isready -h ci-pg-${BUILD_NUMBER} -U postgres && break
                                    sleep 2
                                done
                                npm install --no-audit --no-fund
                                (cd shared && npm run prisma:generate && npx tsc)
                                # Apply migrations against the throwaway CI DB so vitest suites
                                # that hit Prisma have the schema in place.
                                (cd shared && npx prisma migrate deploy --schema=src/prisma/schema.prisma)
                                (cd services/campaign-service && npm install --no-audit --no-fund && npx vitest run)
                            '''
                        }
                    }
                }
            }
        }

        stage('Migration Drift Check') {
            agent {
                docker {
                    image 'node:20'
                    reuseNode true
                    args '--user 0:0'
                }
            }
            steps {
                sh '''
                    set -e
                    cd shared
                    npm install --no-audit --no-fund
                    npx prisma validate --schema=src/prisma/schema.prisma
                    # Fails non-zero if schema.prisma and migrations are
                    # out of sync — block the pipeline before deploy.
                    npx prisma migrate diff \
                        --from-migrations src/prisma/migrations \
                        --to-schema-datamodel src/prisma/schema.prisma \
                        --exit-code
                '''
            }
        }

        stage('Build Images') {
            parallel {
                stage('Build edge bundle') {
                    steps {
                        script {
                            docker.build("fitisol/callora-edge:${IMAGE_TAG}", "-f bundles/edge/Dockerfile .")
                        }
                    }
                }
                stage('Build core bundle') {
                    steps {
                        script {
                            docker.build("fitisol/callora-core:${IMAGE_TAG}", "-f bundles/core/Dockerfile .")
                        }
                    }
                }
                stage('Build io bundle') {
                    steps {
                        script {
                            docker.build("fitisol/callora-io:${IMAGE_TAG}", "-f bundles/io/Dockerfile .")
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
                        ['callora-edge', 'callora-core', 'callora-io', 'callora-frontend', 'callora-admin'].each { name ->
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
                                # Apply pending Prisma migrations against the live DB before
                                # rolling out new app containers. Uses the campaign-service
                                # image which bundles @callora/shared (where the canonical
                                # schema + migrations live) inside its node_modules.
                                docker compose run --rm --no-deps campaign-service npx prisma migrate deploy --schema=node_modules/@callora/shared/src/prisma/schema.prisma
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
                    echo "Waiting for edge bundle to start..."
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