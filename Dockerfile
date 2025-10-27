# Dockerfile for ZK Qualified Signature System
# Supports both SHA-256 (native bb) and Poseidon circuits

FROM node:22-bullseye

# Install system dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Install native bb CLI
RUN curl -L https://aztec-bb-artifacts.s3.amazonaws.com/bb-$(uname -m)-$(uname -s) -o /usr/local/bin/bb \
    && chmod +x /usr/local/bin/bb

# Install Nargo (Noir compiler)
RUN curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash \
    && bash -c ". $HOME/.bashrc && noirup -v 1.0.0-beta.3"

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json yarn.lock ./

# Install dependencies
RUN yarn install --frozen-lockfile

# Copy application code
COPY . .

# Compile circuits
RUN cd circuits/pades_ecdsa && /root/.nargo/bin/nargo compile
RUN cd circuits/pades_ecdsa_poseidon && /root/.nargo/bin/nargo compile

# Create output directories
RUN mkdir -p out logs benchmarks

# Expose ports (if needed for future web interface)
EXPOSE 3000

# Default command (can be overridden)
CMD ["yarn", "prove:bb"]
